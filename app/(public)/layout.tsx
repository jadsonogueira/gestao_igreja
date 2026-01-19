import { Toaster } from "react-hot-toast";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="min-h-screen bg-gray-50 px-4 py-10 sm:py-14">
        {children}
      </main>
      <Toaster position="top-right" />
    </>
  );
}