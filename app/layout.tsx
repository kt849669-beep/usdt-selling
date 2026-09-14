import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Nexa P2P',description:'Buy-only USDT marketplace with payment verification, admin approval and manual TRC20 delivery.',robots:{index:false,follow:false},icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className="light"><body>{children}</body></html>;}
