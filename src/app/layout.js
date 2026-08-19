import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import ChatBot from "@/components/ChatBot";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata = {
  metadataBase: new URL("https://hostme-xbhx.vercel.app"),
  title: {
    default: "HostMe | Find and book spaces in Ilorin",
    template: "%s | HostMe",
  },
  description:
    "Discover venues, karaoke bars, event centers and shortlets in Ilorin. Book instantly, split costs with group booking and pay securely with Paystack.",
  keywords: ["HostMe", "Ilorin", "spaces", "event centers", "karaoke", "shortlets", "group booking", "Nigeria"],
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: "https://hostme-xbhx.vercel.app",
    siteName: "HostMe",
    title: "HostMe | Find and book spaces in Ilorin",
    description:
      "Discover venues, karaoke bars, event centers and shortlets in Ilorin. Book instantly and split costs with group booking.",
    images: [
      {
        url: "https://images.pexels.com/photos/29692582/pexels-photo-29692582.jpeg?auto=compress&cs=tinysrgb&w=1200",
        width: 1200,
        height: 1500,
        alt: "Elegant event space in Ilorin",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HostMe | Find and book spaces in Ilorin",
    description:
      "Discover venues, karaoke bars, event centers and shortlets in Ilorin. Book instantly and split costs with group booking.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return (
    <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">{children}<ChatBot /></body>
      </html>
  );
}
