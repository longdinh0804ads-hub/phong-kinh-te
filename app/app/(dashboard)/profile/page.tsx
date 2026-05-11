import { requireAuth } from "@/lib/session";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarUpload } from "@/components/profile/avatar-upload";

export default async function ProfilePage() {
  const user = await requireAuth();

  // Trên Vercel (filesystem ephemeral) → tắt upload, dùng initials làm avatar.
  // Khi sang Vercel Blob hoặc Supabase Storage thì bỏ guard này.
  const avatarUploadEnabled =
    process.env.VERCEL !== "1" && process.env.DISABLE_AVATAR_UPLOAD !== "1";

  return (
    <div className="max-w-3xl">
      <PageHeader title="Hồ sơ cá nhân" description="Thông tin tài khoản và lĩnh vực phụ trách" />

      <Card className="mb-4">
        <CardContent className="pt-6">
          <AvatarUpload
            userName={user.name}
            currentImage={user.image}
            size="xl"
            uploadEnabled={avatarUploadEnabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold">{user.name}</h2>
            <p className="text-muted-foreground">{user.position}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="info">{ROLE_LABELS[user.role]}</Badge>
              <Badge variant="secondary">{DEPARTMENT_LABELS[user.department]}</Badge>
              {user.isTeamLeader && <Badge variant="warning">Trưởng nhóm</Badge>}
              {user.teamGroupCode && <Badge variant="outline">{user.teamGroupCode === "to-1" ? "Tổ 1" : "Tổ 2"}</Badge>}
            </div>
          </div>

          <div className="space-y-4">
            <Section title="Email công vụ">{user.email}</Section>
            {user.phone && <Section title="Số điện thoại">{user.phone}</Section>}

            {user.fields.length > 0 && (
              <Section title="Lĩnh vực phụ trách">
                <div className="flex flex-wrap gap-1.5">
                  {user.fields.map((f) => <Badge key={f} variant="secondary">{f}</Badge>)}
                </div>
              </Section>
            )}

            {user.areas.length > 0 && (
              <Section title="Địa bàn phụ trách">
                <div className="flex flex-wrap gap-1.5">
                  {user.areas.map((a) => <Badge key={a} variant="info">{a}</Badge>)}
                </div>
              </Section>
            )}

            {user.responsibilities && (
              <Section title="Nhiệm vụ chi tiết">
                <p className="text-sm leading-relaxed text-muted-foreground">{user.responsibilities}</p>
              </Section>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase font-semibold text-muted-foreground mb-1">{title}</div>
      <div>{children}</div>
    </div>
  );
}
