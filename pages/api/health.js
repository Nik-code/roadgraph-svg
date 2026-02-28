export default function handler(req, res) {
    if (req.method === "GET") {
        return res.status(200).json({
            ok: true,
            service: "roadgraph-svg",
            time: new Date().toISOString(),
        });
    }
    return res.status(405).json({ ok: false, error: "Method not allowed." });
}
