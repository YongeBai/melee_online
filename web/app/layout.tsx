import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Melee Online',
  description:
    'Play your local copy of Melee in the browser: choose your fighters and stage, four stocks, eight minutes, no items, versus a level-9 CPU.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
