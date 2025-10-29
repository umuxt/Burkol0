import { FileText, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";

export function TemplatesLibrary() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1>Templates Library</h1>
            <p className="text-muted-foreground">
              Production plan şablonlarını kaydedin ve yeniden kullanın
            </p>
          </div>
        </div>
      </div>

      {/* Content - Coming Soon */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          <Alert className="border-dashed">
            <Rocket className="h-4 w-4" />
            <AlertDescription>
              <strong>Coming Soon!</strong> Templates Library özelliği yakında eklenecek.
            </AlertDescription>
          </Alert>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Neler Gelecek?</CardTitle>
              <CardDescription>
                Templates Library tamamlandığında aşağıdaki özellikleri kullanabileceksiniz
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm">
                    1
                  </div>
                  <div>
                    <strong>Template Kaydetme:</strong>
                    <p className="text-sm text-muted-foreground mt-1">
                      Plan Designer'da oluşturduğunuz production plan'i şablon olarak kaydedin
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm">
                    2
                  </div>
                  <div>
                    <strong>Template Yükleme:</strong>
                    <p className="text-sm text-muted-foreground mt-1">
                      Kayıtlı şablonları Plan Designer'da açıp yeni iş emirleri için kullanın
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm">
                    3
                  </div>
                  <div>
                    <strong>Template Kütüphanesi:</strong>
                    <p className="text-sm text-muted-foreground mt-1">
                      Sık kullanılan production flow'ları organize edin, kategorize edin ve yönetin
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm">
                    4
                  </div>
                  <div>
                    <strong>Kullanım İstatistikleri:</strong>
                    <p className="text-sm text-muted-foreground mt-1">
                      Hangi şablonların ne sıklıkla kullanıldığını takip edin
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Şu Anda Template Yok</h3>
            <p className="text-sm text-muted-foreground">
              Plan Designer'da template kaydetme özelliği eklendiğinde,<br />
              kayıtlı template'leriniz burada görünecek.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
