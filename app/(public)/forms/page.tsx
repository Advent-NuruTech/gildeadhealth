import type { Metadata } from "next";
import FormsPage from "@/components/public/pages/FormsPage";

export const metadata: Metadata = {
  title: "Forms | Gilead Medicare",
  description: "View, download, complete and securely submit Gilead Medicare forms.",
};

export default function Page() {
  return <FormsPage />;
}
