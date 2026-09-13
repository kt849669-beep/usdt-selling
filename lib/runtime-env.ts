// Sites keeps its managed D1 binding. Next.js aliases this module to the
// server-only Vercel implementation; client components must never import it.
export {env} from 'cloudflare:workers';
