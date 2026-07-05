import "./globals.css";
import AppShell from "./components/AppShell";

export const metadata = {
  title: "The Brief",
  description: "Your newsletters, summarized into one intelligent briefing.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
