import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "prismjs/themes/prism-tomorrow.css";
import "./globals.css";

const poppins = localFont({
  src: [
    { path: "../../public/fonts/Poppins/Poppins-Thin.ttf", weight: "100" },
    {
      path: "../../public/fonts/Poppins/Poppins-ExtraLight.ttf",
      weight: "200",
    },
    { path: "../../public/fonts/Poppins/Poppins-Light.ttf", weight: "300" },
    { path: "../../public/fonts/Poppins/Poppins-Regular.ttf", weight: "400" },
    { path: "../../public/fonts/Poppins/Poppins-Medium.ttf", weight: "500" },
    { path: "../../public/fonts/Poppins/Poppins-SemiBold.ttf", weight: "600" },
    { path: "../../public/fonts/Poppins/Poppins-Bold.ttf", weight: "700" },
    { path: "../../public/fonts/Poppins/Poppins-ExtraBold.ttf", weight: "800" },
    { path: "../../public/fonts/Poppins/Poppins-Black.ttf", weight: "900" },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AnyResponses Portal",
  description:
    "Multi-provider routing for AI responses. Configure once, route by model prefix, scale across vendors.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-8GCVW00WSX"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-8GCVW00WSX');`}
        </Script>
        {children}
      </body>
    </html>
  );
}
