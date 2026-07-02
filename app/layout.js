export const metadata = {
  title: "The Brief — Console",
  description: "Ask your newsletter corpus anything.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
