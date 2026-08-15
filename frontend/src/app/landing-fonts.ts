import { DM_Sans, Instrument_Sans } from "next/font/google";

// Landing-page-only typefaces. Declared in their own module (no "use client")
// so the client-side page can import them without pulling next/font into the
// root layout — the app keeps Geist, the public landing gets its own voice.
export const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const dmSans = DM_Sans({
  variable: "--font-dm",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});
