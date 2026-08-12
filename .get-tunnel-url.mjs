
import { Tunnel } from "cloudflared";

const t = Tunnel.quick("http://localhost:4321");
t.once("url", (url) => {
  console.log("TUNNEL_URL=" + url);
});
t.on("error", (e) => console.error("tunnel error", e));
// Intentionally never exits — keeps the tunnel alive for live testing.
