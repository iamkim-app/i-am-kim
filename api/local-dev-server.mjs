import dotenv from "dotenv";
import http from "http";
import summarizeHandler from "./summarize.js";
dotenv.config({ path: ".env.local" });


const PORT = 8787;

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(body);
}

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  if (req.url === "/api/health" && req.method === "GET") {
    return send(res, 200, { ok: true });
  }

  if (req.url === "/api/summarize" && req.method === "POST") {
    try {
      req.body = await readJson(req).catch(() => ({}));

      if (!res.status) {
        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
      }

      if (!res.json) {
        res.json = (obj) => {
          if (!res.getHeader("Content-Type")) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
          }
          res.end(JSON.stringify(obj));
          return res;
        };
      }

      return await summarizeHandler(req, res);
    } catch (e) {
      return send(res, 500, {
        error: "Summarization failed.",
        details: String(e?.message || e),
      });
    }
  }

  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`[local-api] listening on http://localhost:${PORT}`);
});
