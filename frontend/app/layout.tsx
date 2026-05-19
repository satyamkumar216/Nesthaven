import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NestHaven POS',
  description: 'Enterprise Inventory & Point of Sale',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-900 text-white antialiased">
        {children}
      </body>
    </html>
  );
}