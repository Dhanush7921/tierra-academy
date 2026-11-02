import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { absoluteUrl } from "@/lib/paths";
import { formatDate } from "@/lib/format";

/** A4 landscape certificate with the original Tierra Automation logo and a verification ID. */
export async function renderCertificatePdf(c: { recipient_name: string; course_title: string; issued_at: string | Date; verification_code: string; revoked_at?: string | null }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificate — ${c.course_title}`);
  doc.setAuthor("Tierra Academy · Tierra Automation");
  const page = doc.addPage([842, 595]);
  const { width: W, height: H } = page.getSize();
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const orange = rgb(1, 0.478, 0), amber = rgb(1, 0.702, 0), navy = rgb(0.043, 0.071, 0.125), muted = rgb(0.38, 0.42, 0.5);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: orange, borderWidth: 3 });
  page.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: amber, borderWidth: 0.8 });
  for (let i = 0; i < 14; i++) page.drawLine({ start: { x: 32, y: 120 + i * 8 }, end: { x: 32 + 60 - i * 4, y: 120 + i * 8 }, thickness: 0.6, color: amber, opacity: 0.6 });
  try {
    const logo = await doc.embedJpg(await readFile(path.join(process.cwd(), "public/brand/tierra-automation-logo.jpg")));
    page.drawImage(logo, { x: W / 2 - 42, y: H - 140, width: 84, height: 84 });
  } catch { /* logo optional */ }
  const center = (t: string, y: number, size: number, font = sans, color = navy) =>
    page.drawText(t, { x: (W - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
  center("TIERRA ACADEMY", H - 165, 13, sansBold, orange);
  center("CERTIFICATE OF COMPLETION", H - 205, 30, serif);
  center("This certifies that", H - 245, 13, sans, muted);
  let nameSize = 34;
  while (serif.widthOfTextAtSize(c.recipient_name, nameSize) > W - 200 && nameSize > 18) nameSize -= 2;
  center(c.recipient_name, H - 292, nameSize, serif);
  page.drawLine({ start: { x: W / 2 - 180, y: H - 304 }, end: { x: W / 2 + 180, y: H - 304 }, thickness: 1, color: amber });
  center("has successfully completed the course", H - 335, 13, sans, muted);
  let titleSize = 20;
  while (sansBold.widthOfTextAtSize(c.course_title, titleSize) > W - 160 && titleSize > 11) titleSize -= 1;
  center(c.course_title, H - 368, titleSize, sansBold);
  page.drawText(`Issued ${formatDate(c.issued_at, { dateStyle: "long" })}`, { x: 80, y: 90, size: 11, font: sans, color: navy });
  page.drawText("Tierra Automation · Visakhapatnam, India", { x: 80, y: 74, size: 9, font: sans, color: muted });
  const v = `Verification ID: ${c.verification_code}`;
  page.drawText(v, { x: W - 80 - sansBold.widthOfTextAtSize(v, 11), y: 90, size: 11, font: sansBold, color: navy });
  const url = absoluteUrl(`/verify/${c.verification_code}`);
  page.drawText(url, { x: W - 80 - sans.widthOfTextAtSize(url, 8), y: 74, size: 8, font: sans, color: muted });
  center("LEARN · BUILD · AUTOMATE", 46, 9, sansBold, orange);
  if (c.revoked_at) page.drawText("REVOKED", { x: W / 2 - 150, y: H / 2 - 40, size: 90, font: sansBold, color: rgb(0.8, 0.1, 0.1), opacity: 0.25 });
  return doc.save();
}
