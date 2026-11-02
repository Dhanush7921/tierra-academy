/**
 * Seeds CLEARLY LABELLED demo content: categories, demo instructors, demo courses, lessons,
 * quizzes, assignments, live sessions, coupons — and (optionally) demo accounts.
 *
 *   npm run db:seed
 *   SEED_DEMO_USERS=false npm run db:seed   → content only, no accounts
 *   DEMO_USER_PASSWORD=...                  → fixed password for demo accounts (CI / e2e);
 *                                             otherwise random passwords are generated and written
 *                                             to .demo-credentials.local (git-ignored).
 *
 * Refuses to create demo accounts when APP_MODE=production.
 * Nothing here represents real achievements, students, testimonials or accreditations.
 */
import postgres from "postgres";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { hashPassword, randomToken } from "../src/lib/crypto";

const url = process.env.DATABASE_URL || "postgres://tierra:tierra_dev@127.0.0.1:5432/tierra_academy";
const withUsers = process.env.SEED_DEMO_USERS !== "false" && process.env.APP_MODE !== "production";

const CATEGORIES = [
  { slug: "electronics", name: "Electronics", accent: "#FFC233", tagline: "Circuits, components & PCB design", description: "Understand voltage, current and components, then design and assemble real circuit boards." },
  { slug: "robotics", name: "Robotics", accent: "#FF7A1A", tagline: "Arms, actuators & motion", description: "Kinematics, servo control and building robots that move with purpose." },
  { slug: "iot", name: "Internet of Things", accent: "#38D2FF", tagline: "Sensors, connectivity & cloud", description: "Connect sensors to the cloud with Wi-Fi, MQTT and live dashboards." },
  { slug: "embedded", name: "Embedded Systems", accent: "#9BE15D", tagline: "Firmware, MCUs & buses", description: "Program microcontrollers in C, master interrupts, RTOS and UART/I²C/SPI/CAN." },
  { slug: "electrical", name: "Electrical Engineering", accent: "#FFD84D", tagline: "Power, motors & control", description: "Power circuits, motors, protection devices and industrial control with PLCs." },
  { slug: "mechanical", name: "Mechanical Engineering", accent: "#C9A7FF", tagline: "Mechanisms, CAD & gears", description: "Gears, linkages and CAD assemblies — the mechanical side of automation." },
];

const INSTRUCTORS = [
  { key: "elec", display_name: "Demo Instructor · Electronics Lab", headline: "Placeholder profile — replace with a real Tierra instructor", expertise: ["Electronics", "PCB design"] },
  { key: "robo", display_name: "Demo Instructor · Robotics & IoT", headline: "Placeholder profile — replace with a real Tierra instructor", expertise: ["Robotics", "IoT", "ESP32"] },
  { key: "mech", display_name: "Demo Instructor · Electro-Mechanical", headline: "Placeholder profile — replace with a real Tierra instructor", expertise: ["Electrical", "Mechanical", "PLC"] },
];

type CourseSeed = {
  slug: string; title: string; subtitle: string; category: string; level: string; delivery: string;
  price: number; hours: number; instructor: string; modules: [string, string[]][];
  quiz: [string, string[], number][]; assignment?: string; status?: string;
};

const COURSES: CourseSeed[] = [
  { slug: "electronics-fundamentals", title: "Electronics Fundamentals: Ohm's Law to Your First PCB", subtitle: "Voltage, current, resistors, capacitors and a first circuit board — from zero.", category: "electronics", level: "BEGINNER", delivery: "RECORDED", price: 0, hours: 6, instructor: "elec",
    modules: [["Foundations", ["What is electricity?", "Ohm's law in practice", "Reading resistor colour codes"]], ["Building circuits", ["Breadboards and your first LED circuit", "Capacitors and RC timing", "From schematic to PCB"]]],
    quiz: [["A 1 kΩ resistor has 5 V across it. What current flows?", ["5 mA", "0.5 mA", "50 mA", "5 A"], 0], ["Which component stores energy in an electric field?", ["Inductor", "Capacitor", "Diode", "Resistor"], 1], ["Brown-black-red bands indicate…", ["100 Ω", "1 kΩ", "10 kΩ", "12 Ω"], 1]] },
  { slug: "analog-circuit-design-studio", title: "Analog Circuit Design Studio", subtitle: "Op-amps, filters and power supplies with guided live labs.", category: "electronics", level: "INTERMEDIATE", delivery: "HYBRID", price: 249900, hours: 14, instructor: "elec",
    modules: [["Op-amps", ["Ideal op-amp rules", "Inverting & non-inverting amplifiers"]], ["Filters & power", ["Active filters", "Linear regulators and ripple"]]],
    quiz: [["An ideal op-amp has input impedance of…", ["Zero", "Infinite", "50 Ω", "1 kΩ"], 1], ["A low-pass RC filter attenuates…", ["Low frequencies", "High frequencies", "DC only", "Nothing"], 1]], assignment: "Design a 2nd-order low-pass filter with fc = 1 kHz" },
  { slug: "build-a-robotic-arm", title: "Build a 4-DOF Robotic Arm", subtitle: "Servos, kinematics and control — assemble and program a desktop arm.", category: "robotics", level: "INTERMEDIATE", delivery: "HYBRID", price: 399900, hours: 18, instructor: "robo",
    modules: [["Mechanics of the arm", ["Degrees of freedom", "Servo motors and PWM"]], ["Control", ["Forward kinematics", "Inverse kinematics made practical", "Pick-and-place sequence"]]],
    quiz: [["Standard hobby servos are positioned using…", ["Analog voltage", "PWM pulse width", "I²C", "Frequency"], 1], ["Computing joint angles from a target position is…", ["Forward kinematics", "Inverse kinematics", "Dynamics", "Odometry"], 1]], assignment: "Submit a video link of your arm completing a pick-and-place" },
  { slug: "robotics-kinematics-essentials", title: "Robotics Kinematics Essentials", subtitle: "Coordinate frames, transforms and motion — the maths robots move by.", category: "robotics", level: "BEGINNER", delivery: "RECORDED", price: 0, hours: 4, instructor: "robo",
    modules: [["Frames & transforms", ["Coordinate frames", "Rotation matrices"]], ["Motion", ["Joint space vs task space"]]],
    quiz: [["A rotation matrix is always…", ["Orthogonal", "Singular", "Diagonal", "Zero"], 0], ["A 2-link planar arm has how many DOF?", ["1", "2", "3", "6"], 1]] },
  { slug: "iot-with-esp32", title: "IoT with ESP32: Sensors to Cloud Dashboard", subtitle: "Wi-Fi, sensors, MQTT and a live dashboard for your own smart device.", category: "iot", level: "BEGINNER", delivery: "RECORDED", price: 299900, hours: 10, instructor: "robo",
    modules: [["ESP32 basics", ["Meet the ESP32", "GPIO, ADC and PWM"]], ["Connected", ["Wi-Fi and HTTP", "MQTT publish/subscribe", "Building the dashboard"]]],
    quiz: [["MQTT uses which pattern?", ["Request/response", "Publish/subscribe", "Peer-to-peer", "Polling"], 1], ["The ESP32 includes…", ["Wi-Fi + Bluetooth", "Only Ethernet", "Only LoRa", "5G"], 0], ["A sensor reading sent every 10 s is…", ["Telemetry", "Firmware", "Bootloader", "OTA"], 0]] },
  { slug: "mqtt-smart-devices-bootcamp", title: "MQTT & Smart Devices Live Bootcamp", subtitle: "Live, instructor-led sessions building a connected home controller.", category: "iot", level: "INTERMEDIATE", delivery: "LIVE", price: 199900, hours: 8, instructor: "robo",
    modules: [["Live sessions", ["Session 1 — Broker & topics", "Session 2 — Device firmware", "Session 3 — Dashboard & alerts"]]],
    quiz: [["QoS 1 in MQTT guarantees…", ["At most once", "At least once", "Exactly once", "Never"], 1]] },
  { slug: "embedded-c-microcontrollers", title: "Embedded C on Microcontrollers", subtitle: "Registers, interrupts and timers — write firmware that talks to hardware.", category: "embedded", level: "BEGINNER", delivery: "RECORDED", price: 0, hours: 8, instructor: "elec",
    modules: [["Firmware basics", ["The embedded toolchain", "Registers and bit manipulation"]], ["Real-time behaviour", ["Interrupts", "Hardware timers", "Debouncing inputs"]]],
    quiz: [["Which operator sets bit 3 of REG?", ["REG |= (1<<3)", "REG &= (1<<3)", "REG ^= 3", "REG = 3"], 0], ["An ISR should be…", ["Long and blocking", "Short and fast", "Recursive", "Called from main"], 1]] },
  { slug: "rtos-and-communication-buses", title: "RTOS & Communication Buses: UART, I²C, SPI, CAN", subtitle: "Tasks, queues and the buses that connect every embedded product.", category: "embedded", level: "ADVANCED", delivery: "HYBRID", price: 349900, hours: 16, instructor: "elec",
    modules: [["RTOS", ["Tasks and scheduling", "Queues and semaphores"]], ["Buses", ["UART and RS-485", "I²C and SPI", "CAN bus fundamentals"]]],
    quiz: [["I²C uses how many signal lines?", ["1", "2", "4", "8"], 1], ["Which bus is common in vehicles?", ["CAN", "HDMI", "SATA", "VGA"], 0]], assignment: "Implement a UART command parser and share your repository link" },
  { slug: "electrical-wiring-and-safety", title: "Electrical Wiring & Safety Basics", subtitle: "Circuits, protection devices and safe practice for the workshop.", category: "electrical", level: "BEGINNER", delivery: "RECORDED", price: 0, hours: 3, instructor: "mech",
    modules: [["Safety first", ["Shock hazards and PPE", "MCBs, RCDs and fuses"]], ["Wiring", ["Single-phase wiring basics"]]],
    quiz: [["An RCD protects primarily against…", ["Overload", "Earth leakage", "Low voltage", "Harmonics"], 1], ["Before working on a circuit you should…", ["Isolate and verify dead", "Wear gloves only", "Work quickly", "Ask a friend"], 0]] },
  { slug: "plc-motor-control-workshop", title: "PLC & Motor Control Live Workshop", subtitle: "Ladder logic, contactors and VFDs in live, hands-on sessions.", category: "electrical", level: "INTERMEDIATE", delivery: "LIVE", price: 449900, hours: 12, instructor: "mech",
    modules: [["Live sessions", ["Ladder logic basics", "Star-delta starter", "VFD speed control"]]],
    quiz: [["A star-delta starter reduces…", ["Starting current", "Running speed", "Frequency", "Torque permanently"], 0]] },
  { slug: "cad-for-mechanisms", title: "CAD for Mechanisms: Gears, Linkages & Assemblies", subtitle: "Model gear trains and linkages, then assemble and animate them.", category: "mechanical", level: "INTERMEDIATE", delivery: "RECORDED", price: 249900, hours: 9, instructor: "mech",
    modules: [["Gears", ["Gear ratio and module", "Modelling a spur gear"]], ["Assemblies", ["Mates and constraints", "Exploded views"]]],
    quiz: [["A 20-tooth gear drives a 60-tooth gear. The ratio is…", ["1:3", "3:1", "1:1", "2:1"], 0], ["An exploded view shows…", ["Stress", "How parts assemble", "Temperature", "Cost"], 1]] },
  { slug: "engineering-drawing-basics", title: "Engineering Drawing Basics", subtitle: "Projections, dimensions and tolerances — read and create technical drawings.", category: "mechanical", level: "BEGINNER", delivery: "RECORDED", price: 0, hours: 3, instructor: "mech",
    modules: [["Drawing fundamentals", ["Orthographic projection", "Dimensioning and tolerances"]]],
    quiz: [["First-angle projection is standard in…", ["India (BIS)", "Nowhere", "Only the USA", "Only CAD"], 0]] },
  { slug: "pcb-design-with-kicad-draft", title: "PCB Design with KiCad (Draft)", subtitle: "A draft course used to demonstrate the approval workflow.", category: "electronics", level: "INTERMEDIATE", delivery: "RECORDED", price: 0, hours: 5, instructor: "elec", status: "DRAFT",
    modules: [["Getting started", ["Schematic capture", "Footprints and layout"]]], quiz: [["Gerber files are used for…", ["Manufacturing PCBs", "Simulating", "Coding", "3D printing"], 0]] },
  { slug: "industrial-sensors-review", title: "Industrial Sensors & Signal Conditioning (In review)", subtitle: "Submitted by a Content Manager and awaiting Super Admin review.", category: "iot", level: "INTERMEDIATE", delivery: "RECORDED", price: 0, hours: 6, instructor: "robo", status: "REVIEW",
    modules: [["Sensors", ["4–20 mA loops", "Thermocouples and RTDs"]]], quiz: [["A 4–20 mA loop reads 4 mA at…", ["0% of range", "50%", "100%", "Fault"], 0]] },
];

export async function seed(databaseUrl = url, opts: { quiet?: boolean } = {}) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const creds: string[] = [];
  try {
    await sql.begin(async (tx) => {
      // categories
      const cat: Record<string, string> = {};
      for (const [i, c] of CATEGORIES.entries()) {
        const [r] = await tx`insert into public.course_categories (slug, name, tagline, description, accent, sort_order)
          values (${c.slug}, ${c.name}, ${c.tagline}, ${c.description}, ${c.accent}, ${i})
          on conflict (slug) do update set name = excluded.name, tagline = excluded.tagline, description = excluded.description, accent = excluded.accent
          returning id`;
        cat[c.slug] = r.id;
      }
      const inst: Record<string, string> = {};
      for (const i of INSTRUCTORS) {
        const existing = await tx`select id from public.instructor_profiles where display_name = ${i.display_name}`;
        inst[i.key] = existing[0]?.id ?? (await tx`insert into public.instructor_profiles (display_name, headline, bio, expertise, is_demo)
          values (${i.display_name}, ${i.headline}, ${"This is placeholder instructor content for the demo. Real instructor bios will be added after approval."}, ${i.expertise}, true) returning id`)[0].id;
      }

      // demo accounts
      const users: Record<string, string> = {};
      if (withUsers) {
        const fixed = process.env.DEMO_USER_PASSWORD;
        const accounts = [
          ["superadmin", "superadmin@demo.tierra.academy", "Demo Super Admin", "SUPER_ADMIN"],
          ["cm", "cm@demo.tierra.academy", "Demo Content Manager", "CONTENT_MANAGER"],
          ["cm2", "cm2@demo.tierra.academy", "Demo Content Manager 2", "CONTENT_MANAGER"],
          ["student", "student@demo.tierra.academy", "Demo Student", "STUDENT"],
          ["student2", "student2@demo.tierra.academy", "Demo Student Two", "STUDENT"],
        ] as const;
        for (const [key, email, name, role] of accounts) {
          const pw = fixed || `Demo-${randomToken(9)}`;
          const existing = await tx`select id from public.profiles where email = ${email}`;
          let id = existing[0]?.id as string | undefined;
          if (!id) {
            id = (await tx`insert into auth.users (email, email_confirmed_at) values (${email}, now()) returning id`)[0].id as string;
            await tx`insert into public.profiles (id, email, full_name) values (${id}, ${email}, ${name})`;
          }
          await tx`insert into public.local_credentials (user_id, password_hash) values (${id}, ${await hashPassword(pw)})
                   on conflict (user_id) do update set password_hash = excluded.password_hash, failed_attempts = 0, locked_until = null`;
          await tx`insert into public.user_roles (user_id, role) values (${id}, ${role}) on conflict do nothing`;
          if (role !== "STUDENT") await tx`insert into public.user_roles (user_id, role) values (${id}, 'STUDENT') on conflict do nothing`;
          users[key] = id;
          creds.push(`${role.padEnd(16)} ${email.padEnd(34)} ${pw}`);
        }
      }

      // sample video assets
      const videos: string[] = [];
      for (let n = 1; n <= 3; n++) {
        const [v] = await tx`insert into public.video_assets (provider, provider_uid, status, original_filename, duration_seconds, captions)
          values ('sample', ${`demo-lesson-${n}`}, 'READY', ${`demo-lesson-${n}.mp4`}, 24, ${tx.json([{ lang: "en", label: "English", src: `demo-lesson-${n}.en.vtt` }])})
          on conflict (provider, provider_uid) do update set status = 'READY' returning id`;
        videos.push(v.id);
      }

      const courseIds: Record<string, string> = {};
      let vi = 0;
      for (const c of COURSES) {
        const status = c.status ?? "PUBLISHED";
        const [row] = await tx`
          insert into public.courses (slug, title, subtitle, description, requirements, outcomes, category_id, level, delivery, is_free, price_paise,
            compare_at_price_paise, status, instructor_id, is_demo, estimated_hours, published_at, created_by, min_attendance_percent)
          values (${c.slug}, ${c.title}, ${c.subtitle},
            ${`${c.subtitle}\n\nDEMO COURSE — this outline is illustrative placeholder content prepared for the Tierra Academy platform demonstration. Final syllabus, duration and pricing will be confirmed by Tierra Automation.`},
            ${["A laptop with internet access", "Curiosity — no prior experience needed for beginner courses"]},
            ${[`Understand the core ideas of ${CATEGORIES.find((x) => x.slug === c.category)!.name.toLowerCase()}`, "Complete hands-on practice exercises", "Earn a verifiable completion certificate"]},
            ${cat[c.category]}, ${c.level}, ${c.delivery}, ${c.price === 0}, ${c.price}, ${c.price ? Math.round(c.price * 1.4 / 100) * 100 : null},
            ${status}, ${inst[c.instructor]}, true, ${c.hours}, ${status === "PUBLISHED" ? new Date() : null},
            ${status === "PUBLISHED" ? users.superadmin ?? null : users.cm ?? null}, ${c.delivery === "LIVE" ? 50 : 0})
          on conflict (slug) do update set title = excluded.title, subtitle = excluded.subtitle
          returning id`;
        const courseId = row.id as string;
        courseIds[c.slug] = courseId;
        const hasStructure = await tx`select 1 from public.course_modules where course_id = ${courseId} limit 1`;
        if (hasStructure[0]) continue;
        let firstLesson: string | null = null;
        for (const [mi, [mTitle, lessons]] of c.modules.entries()) {
          const [m] = await tx`insert into public.course_modules (course_id, title, position) values (${courseId}, ${mTitle}, ${mi}) returning id`;
          for (const [li, lTitle] of lessons.entries()) {
            const isLive = c.delivery === "LIVE";
            const [l] = await tx`insert into public.lessons (course_id, module_id, title, summary, body, kind, video_asset_id, duration_seconds, position, is_preview)
              values (${courseId}, ${m.id}, ${lTitle}, ${`Demo lesson: ${lTitle}.`},
                ${`## ${lTitle}\n\nThis is demo lesson content. Replace it with the real lesson notes.\n\n- Key idea one\n- Key idea two\n- Practice task`},
                ${isLive ? "LIVE" : "VIDEO"}, ${isLive ? null : videos[vi++ % videos.length]}, ${isLive ? 3600 : 24}, ${li}, ${mi === 0 && li === 0})
              returning id`;
            firstLesson ??= l.id as string;
          }
        }
        const [q] = await tx`insert into public.quizzes (course_id, title, description, pass_percent, max_attempts)
          values (${courseId}, ${"Knowledge check"}, ${"Answer the questions to check your understanding."}, 60, 5) returning id`;
        for (const [qi, [prompt, options, correct]] of c.quiz.entries())
          await tx`insert into public.questions (quiz_id, prompt, options, correct_index, explanation, position)
                   values (${q.id}, ${prompt}, ${tx.json(options)}, ${correct}, ${`The correct answer is “${options[correct]}”.`}, ${qi})`;
        if (c.assignment)
          await tx`insert into public.assignments (course_id, title, instructions, max_points, pass_points, due_at)
                   values (${courseId}, ${c.assignment}, ${"Submit your work as text, a link or a file (PDF/PNG/JPG/ZIP). Demo assignment."}, 100, 50, now() + interval '30 days')`;
        // live sessions for live/hybrid courses
        if (c.delivery !== "RECORDED" && status === "PUBLISHED") {
          const offsets = c.slug === "mqtt-smart-devices-bootcamp" ? [-5, 60 * 26, 60 * 74] : [60 * 50, 60 * 122];
          for (const [si, mins] of offsets.entries())
            await tx`insert into public.live_sessions (course_id, title, description, starts_at, duration_minutes, host_id, status, provider, is_demo, proposed_by)
              values (${courseId}, ${`${c.title.split(":")[0]} — Live session ${si + 1}`}, ${"Demo live class (simulated classroom)."},
                      now() + make_interval(mins => ${mins}), 90, ${users.cm ?? null}, 'SCHEDULED', 'demo', true, ${users.superadmin ?? null})`;
        }
        if (users.cm && ["iot", "embedded", "electronics"].includes(c.category))
          await tx`insert into public.content_manager_assignments (user_id, course_id, assigned_by) values (${users.cm}, ${courseId}, ${users.superadmin}) on conflict do nothing`;
        if (status === "REVIEW" && users.cm)
          await tx`insert into public.approval_requests (course_id, kind, requested_by, note) values (${courseId}, 'COURSE_PUBLISH', ${users.cm}, ${"Ready for review — demo submission."})`;
        void firstLesson;
      }

      // coupons (demo)
      for (const [code, kind, value] of [["WELCOME10", "PERCENT", 10], ["TIERRA500", "FLAT", 50000], ["DEMOFREE100", "PERCENT", 100]] as const)
        await tx`insert into public.coupons (code, kind, value, max_redemptions, created_by) values (${code}, ${kind}, ${value}, 500, ${users.superadmin ?? null}) on conflict (code) do nothing`;

      await tx`insert into public.platform_settings (key, value) values
        ('support', ${tx.json({ email: "academy@tierraautomation.in", phone: "", whatsapp: "" })}),
        ('refund_policy', ${tx.json({ windowDays: 7 })}),
        ('branding', ${tx.json({ tagline: "Learn. Build. Automate." })})
        on conflict (key) do nothing`;

      // demo student activity
      if (users.student) {
        const enroll = async (slug: string, source: string, orderId: string | null = null) =>
          tx`insert into public.enrollments (user_id, course_id, status, source, order_id) values (${users.student}, ${courseIds[slug]}, 'ACTIVE', ${source}, ${orderId}) on conflict do nothing`;
        await enroll("electronics-fundamentals", "FREE");
        await enroll("embedded-c-microcontrollers", "FREE");
        const existingOrder = await tx`select id from public.orders where receipt = 'TA-DEMO-SEED-1'`;
        if (!existingOrder[0]) {
          const [o] = await tx`insert into public.orders (user_id, course_id, status, provider, provider_order_id, subtotal_paise, amount_paise, receipt, paid_at)
            values (${users.student}, ${courseIds["iot-with-esp32"]}, 'PAID', 'demo', ${"demo_order_seed_1"}, 299900, 299900, 'TA-DEMO-SEED-1', now() - interval '2 days') returning id`;
          await tx`insert into public.payments (order_id, user_id, provider, provider_payment_id, status, amount_paise, method)
                   values (${o.id}, ${users.student}, 'demo', 'demo_pay_seed_1', 'CAPTURED', 299900, 'demo')`;
          await enroll("iot-with-esp32", "PURCHASE", o.id);
          await enroll("mqtt-smart-devices-bootcamp", "COMPLIMENTARY");
        }
        // partial progress on electronics fundamentals
        const ls = await tx`select id from public.lessons where course_id = ${courseIds["electronics-fundamentals"]} order by position limit 2`;
        for (const l of ls)
          await tx`insert into public.lesson_progress (user_id, lesson_id, course_id, position_seconds, watched_seconds, completed, completed_at)
                   values (${users.student}, ${l.id}, ${courseIds["electronics-fundamentals"]}, 24, 24, true, now()) on conflict do nothing`;
        await tx`update public.enrollments set progress_percent = 33.33 where user_id = ${users.student} and course_id = ${courseIds["electronics-fundamentals"]}`;
        await tx`insert into public.notifications (user_id, kind, title, body, link) values
          (${users.student}, 'INFO', 'Welcome to Tierra Academy (demo)', 'Explore your engineering lab dashboard.', '/dashboard')`;
      }
    });
    if (creds.length && !opts.quiet) {
      const file = path.resolve(__dirname, "../.demo-credentials.local");
      writeFileSync(file, `# DEMO ACCOUNTS — local/demo use only. Do not share. Regenerated on each seed.\n${creds.join("\n")}\n`, { mode: 0o600 });
      console.log(`✓ demo accounts written to .demo-credentials.local`);
    }
    if (!opts.quiet) console.log("✓ seed complete (demo content)");
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  seed().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
