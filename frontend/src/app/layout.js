import './globals.css';
import Header from '@/components/Header';

export const metadata = {
  title: 'PriceTracker — Smart Product Price Monitoring',
  description: 'Track product prices on Amazon and Flipkart. Get instant email alerts when prices drop to your target. Smart scraping with AI-powered fallback.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="container" style={{ paddingTop: '16px', paddingBottom: '60px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
