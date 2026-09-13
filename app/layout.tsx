import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Nexa P2P',description:'Independent buy-only USDT P2P prototype. No real money or crypto transfers.',robots:{index:false,follow:false},icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className="light"><body>{children}</body></html>;}
