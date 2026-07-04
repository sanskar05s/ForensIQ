export function generateCaseId() {
  const year = new Date().getFullYear();

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let random = "";

  for (let i = 0; i < 4; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }

  return `CASE-${year}-${random}`;
}
