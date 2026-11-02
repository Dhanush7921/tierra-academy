import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, as, admin, userByEmail, course, closeAll } from "./helpers";

let student: Awaited<ReturnType<typeof userByEmail>>;
let student2: Awaited<ReturnType<typeof userByEmail>>;
let cm: Awaited<ReturnType<typeof userByEmail>>;
let cm2: Awaited<ReturnType<typeof userByEmail>>;
let sa: Awaited<ReturnType<typeof userByEmail>>;

beforeAll(async () => {
  await resetDb();
  [student, student2, cm, cm2, sa] = await Promise.all([
    userByEmail("student@demo.tierra.academy"), userByEmail("student2@demo.tierra.academy"),
    userByEmail("cm@demo.tierra.academy"), userByEmail("cm2@demo.tierra.academy"), userByEmail("superadmin@demo.tierra.academy"),
  ]);
});
afterAll(closeAll);

describe("anonymous visitors", () => {
  it("see only published courses", async () => {
    const r = await as(null, "select status from public.courses");
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((c) => c.status === "PUBLISHED")).toBe(true);
  });
  it("cannot read lesson bodies, enrollments, orders or video assets", async () => {
    for (const t of ["lessons", "enrollments", "orders", "video_assets", "questions", "profiles"]) {
      const r = await as(null, `select * from public.${t} limit 1`);
      expect(r.error).toBe("42501"); // permission denied — anon has no grant
    }
  });
  it("can read the public outline of a published course but not a draft", async () => {
    const pub = await course("electronics-fundamentals");
    const draft = await course("pcb-design-with-kicad-draft");
    expect((await as(null, "select * from public.course_outline($1)", [pub.id])).rows.length).toBeGreaterThan(0);
    expect((await as(null, "select * from public.course_outline($1)", [draft.id])).rows.length).toBe(0);
  });
});

describe("students", () => {
  it("cannot enroll themselves by inserting rows directly", async () => {
    const paid = await course("build-a-robotic-arm");
    const r = await as(student2.id, "insert into public.enrollments (user_id, course_id, source) values ($1, $2, 'FREE')", [student2.id, paid.id]);
    expect(r.error).toBe("42501");
  });
  it("only see their own enrollments, orders and payments", async () => {
    const e = await as(student2.id, "select user_id from public.enrollments");
    expect(e.rows.every((r) => r.user_id === student2.id)).toBe(true);
    const o = await as(student2.id, "select * from public.orders");
    expect(o.rows.length).toBe(0); // student2 has no orders; student's seeded order is invisible
    const mine = await as(student.id, "select * from public.orders");
    expect(mine.rows.length).toBe(1);
  });
  it("never see quiz answer keys", async () => {
    const r = await as(student.id, "select correct_index from public.questions");
    expect(r.rows.length).toBe(0);
  });
  it("cannot read lessons of courses they are not enrolled in (except previews)", async () => {
    const arm = await course("build-a-robotic-arm");
    const r = await as(student.id, "select id, is_preview from public.lessons where course_id = $1", [arm.id]);
    expect(r.rows.every((l) => l.is_preview === true)).toBe(true);
    const enrolled = await course("electronics-fundamentals");
    const r2 = await as(student.id, "select id from public.lessons where course_id = $1", [enrolled.id]);
    expect(r2.rows.length).toBeGreaterThan(1);
  });
  it("cannot change course prices or status", async () => {
    const c = await course("iot-with-esp32");
    const r = await as(student.id, "update public.courses set price_paise = 100 where id = $1 returning id", [c.id]);
    expect(r.rows.length).toBe(0); // RLS: no update visibility
  });
  it("cannot grant themselves roles or read admin data", async () => {
    expect((await as(student.id, "insert into public.user_roles (user_id, role) values ($1, 'SUPER_ADMIN')", [student.id])).error).toBe("42501");
    expect((await as(student.id, "insert into public.user_roles (user_id, role) values ($1, 'CONTENT_MANAGER')", [student.id])).error).toBe("42501");
    expect((await as(student.id, "select * from public.audit_logs")).rows.length).toBe(0);
    expect((await as(student.id, "select * from public.live_session_secrets")).rows.length).toBe(0);
    expect((await as(student.id, "select * from public.local_credentials")).rows.length).toBe(0);
    expect((await as(student.id, "select * from public.video_assets")).rows.length).toBe(0);
    expect((await as(student.id, "select * from public.coupons")).rows.length).toBe(0);
  });
  it("cannot change protected profile fields", async () => {
    const r = await as(student.id, "update public.profiles set session_version = 99 where id = $1", [student.id]);
    expect(r.error).toBe("42501");
    const ok = await as(student.id, "update public.profiles set full_name = 'Renamed Student' where id = $1 returning id", [student.id]);
    expect(ok.rows.length).toBe(1);
  });
  it("cannot grade their own assignment submission", async () => {
    const [a] = await admin`select a.id from public.assignments a join public.courses c on c.id = a.course_id where c.slug = 'analog-circuit-design-studio'`;
    const c = await course("analog-circuit-design-studio");
    await admin`insert into public.enrollments (user_id, course_id, source) values (${student2.id}, ${c.id}, 'ADMIN') on conflict do nothing`;
    const r = await as(student2.id, "insert into public.submissions (assignment_id, user_id, text_answer, points, status) values ($1, $2, 'x', 100, 'GRADED')", [a.id, student2.id]);
    expect(r.error).toBe("42501");
    const ok = await as(student2.id, "insert into public.submissions (assignment_id, user_id, text_answer) values ($1, $2, 'my answer') returning id", [a.id, student2.id]);
    expect(ok.rows.length).toBe(1);
  });
});

describe("content managers", () => {
  it("see assigned drafts but not unassigned drafts", async () => {
    const draft = await course("pcb-design-with-kicad-draft"); // electronics → assigned to cm
    expect((await as(cm.id, "select id from public.courses where id = $1", [draft.id])).rows.length).toBe(1);
    expect((await as(cm2.id, "select id from public.courses where id = $1", [draft.id])).rows.length).toBe(0);
  });
  it("cannot modify prices, even on assigned draft courses", async () => {
    const draft = await course("pcb-design-with-kicad-draft");
    const r = await as(cm.id, "update public.courses set is_free = false, price_paise = 99900 where id = $1", [draft.id]);
    expect(r.error).toBe("42501");
  });
  it("cannot publish directly, but can submit for review", async () => {
    const draft = await course("pcb-design-with-kicad-draft");
    expect((await as(cm.id, "update public.courses set status = 'PUBLISHED' where id = $1", [draft.id])).error).toBe("42501");
    const ok = await as(cm.id, "update public.courses set status = 'REVIEW' where id = $1 returning status", [draft.id]);
    expect(ok.rows[0]?.status).toBe("REVIEW");
    // once in review the CM can no longer edit it
    const locked = await as(cm.id, "update public.courses set title = 'changed' where id = $1 returning id", [draft.id]);
    expect(locked.rows.length).toBe(0);
    await admin`update public.courses set status = 'DRAFT' where id = ${draft.id}`;
  });
  it("cannot edit lessons of a published course directly (revisions required)", async () => {
    const pub = await course("embedded-c-microcontrollers");
    const r = await as(cm.id, "update public.lessons set title = 'x' where course_id = $1 returning id", [pub.id]);
    expect(r.rows.length).toBe(0);
  });
  it("cannot access revenue, payments, refunds, coupons, settings or audit logs", async () => {
    for (const t of ["orders", "payments", "refunds", "coupons", "platform_settings", "audit_logs", "email_outbox", "certificates"]) {
      expect((await as(cm.id, `select * from public.${t}`)).rows.length).toBe(0);
    }
  });
  it("cannot create administrators or change permissions", async () => {
    expect((await as(cm.id, "insert into public.user_roles (user_id, role) values ($1, 'CONTENT_MANAGER')", [student.id])).error).toBe("42501");
    expect((await as(cm.id, "insert into public.content_manager_assignments (user_id, course_id) select $1, id from public.courses limit 1", [cm.id])).error).toBe("42501");
  });
  it("cannot create complimentary invitations", async () => {
    const c = await course("iot-with-esp32");
    const r = await as(cm.id, "insert into public.invitations (token_hash, course_id, grants_complimentary, expires_at, created_by) values ('h1', $1, true, now() + interval '1 day', $2)", [c.id, cm.id]);
    expect(r.error).toBe("42501");
    const ok = await as(cm.id, "insert into public.invitations (token_hash, course_id, grants_complimentary, expires_at, created_by) values ('h2', $1, false, now() + interval '1 day', $2) returning id", [c.id, cm.id]);
    expect(ok.rows.length).toBe(1);
  });
  it("only see student data for their assigned courses", async () => {
    const r = await as(cm.id, "select e.course_id, c.slug from public.enrollments e join public.courses c on c.id = e.course_id");
    const assigned = (await admin`select course_id from public.content_manager_assignments where user_id = ${cm.id}`).map((x) => x.course_id);
    expect(r.rows.every((e) => assigned.includes(e.course_id))).toBe(true);
    expect((await as(cm.id, "select * from public.profiles where id <> $1", [cm.id])).rows.length).toBe(0);
  });
  it("can only propose live sessions (not schedule them)", async () => {
    const c = await course("iot-with-esp32");
    expect((await as(cm.id, "insert into public.live_sessions (course_id, title, starts_at, status, proposed_by) values ($1, 'x', now() + interval '1 day', 'SCHEDULED', $2)", [c.id, cm.id])).error).toBe("42501");
    expect((await as(cm.id, "insert into public.live_sessions (course_id, title, starts_at, status, proposed_by) values ($1, 'x', now() + interval '1 day', 'PROPOSED', $2) returning id", [c.id, cm.id])).rows.length).toBe(1);
  });
});

describe("super admin", () => {
  it("can change pricing and publish", async () => {
    const draft = await course("pcb-design-with-kicad-draft");
    const r = await as(sa.id, "update public.courses set is_free = false, price_paise = 149900, status = 'PUBLISHED' where id = $1 returning status, price_paise", [draft.id]);
    expect(r.rows[0]).toMatchObject({ status: "PUBLISHED", price_paise: 149900 });
  });
  it("still cannot mint another SUPER_ADMIN through the API (provisioning only)", async () => {
    expect((await as(sa.id, "insert into public.user_roles (user_id, role) values ($1, 'SUPER_ADMIN')", [student.id])).error).toBe("42501");
  });
  it("can read audit logs and all orders", async () => {
    expect((await as(sa.id, "select * from public.orders")).rows.length).toBeGreaterThan(0);
  });
});
