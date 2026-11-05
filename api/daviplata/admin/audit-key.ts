import { deriveDaviAuditKeys } from "../../../lib/daviplata-audit-crypto";

export default function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) return res.status(503).json({ error: "Clave de firma no disponible." });

  const { publicKey } = deriveDaviAuditKeys(sessionSecret);
  res.setHeader("Cache-Control", "public, s-maxage=300, max-age=300");
  return res.status(200).json({ publicKey });
}
