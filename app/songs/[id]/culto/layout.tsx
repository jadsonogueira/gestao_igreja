export const dynamic = "force-dynamic";

export default function CultoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
      {children}
    </div>
  );
}