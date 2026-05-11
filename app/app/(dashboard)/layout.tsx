import { requireAuth } from "@/lib/session";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";
import { db } from "@/lib/db";
import { getSidebarBadges } from "@/lib/sidebar-badges";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();

  // Fetch notification + sidebar badges song song
  const [notificationCount, badges] = await Promise.all([
    db.notification.count({
      where: { userId: user.id, isRead: false },
    }),
    getSidebarBadges({
      id: user.id,
      role: user.role,
      teamGroupCode: user.teamGroupCode,
    }),
  ]);

  return (
    <div className="min-h-screen bg-page-gradient">
      <Sidebar
        role={user.role}
        userName={user.name}
        position={user.position}
        image={user.image}
        badges={badges}
      />
      <div className="md:pl-72">
        <Header
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            position: user.position,
            image: user.image,
          }}
          notificationCount={notificationCount}
        />
        <main className="px-4 md:px-6 py-6 pb-24 md:pb-6 max-w-7xl mx-auto animate-fade-in-up">
          {children}
        </main>
      </div>
      <BottomNav role={user.role} badges={badges} />
    </div>
  );
}
