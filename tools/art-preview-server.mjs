import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.ART_PREVIEW_PORT || 4177);
const types = { '.html':'text/html; charset=utf-8', '.png':'image/png', '.js':'text/javascript', '.json':'application/json', '.webmanifest':'application/manifest+json' };
http.createServer(async (req,res)=>{
  try {
    const url = new URL(req.url,'http://127.0.0.1');
    const rel = decodeURIComponent(url.pathname === '/' ? '/tools/art-preview.html' : url.pathname);
    const path = resolve(root,'.'+rel);
    if(!path.startsWith(resolve(root)+sep) || rel.includes('/.')) {res.writeHead(403);res.end();return;}
    const data = await readFile(path);
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Art preview: http://127.0.0.1:${port}/tools/art-preview.html`));
