import { ArrowRight, Globe, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiKeyCheck } from "@/components/ApiKeyCheck";
import { PortolanLogo } from "@/components/portolan-logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { listCatalogs } from "@/services/catalogs";

export default function Home() {
  const catalogs = listCatalogs();

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background atmosphere */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-portolan-blue/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-portolan-cyan/5 rounded-full blur-[100px]" />
      </div>

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-4 sm:px-6 pt-4">
        <div className="flex items-center gap-2">
          <PortolanLogo size={20} />
          <span className="text-sm font-bold text-foreground">Portolan</span>
          <Sparkles className="w-3.5 h-3.5 text-portolan-cyan" />
        </div>
        <ThemeSwitcher />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-10 sm:pt-20 pb-16">
        {/* Hero */}
        <div className="text-center mb-14 sm:mb-20">
          <div className="flex justify-center mb-6">
            <PortolanLogo size={48} />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl tracking-tight text-foreground leading-[1.05] mb-4 sm:mb-6">
            Explore
            <br />
            <span className="italic text-portolan-cyan">every catalog</span>
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed px-4">
            Pick a catalog to ask questions about its datasets. Get instant answers as interactive maps, charts, and
            tables.
          </p>
        </div>

        {/* Catalog picker */}
        <ApiKeyCheck>
          <div className="mb-12 sm:mb-16">
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <span className="font-[family-name:var(--font-mono)] text-xs text-muted-foreground tracking-widest uppercase">
                01
              </span>
              <div className="h-px flex-1 bg-border" />
              <span className="text-sm text-muted-foreground">Catalogs</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {catalogs.map((c) => (
                <Link
                  key={c.slug}
                  to={`/${c.slug}`}
                  className="group glass-panel rounded-2xl p-5 sm:p-6 transition-all hover:scale-[1.02] hover:border-portolan-cyan/30 flex flex-col"
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <Globe className="w-5 h-5 text-portolan-cyan" />
                    <h2 className="text-lg font-semibold text-foreground">{c.title}</h2>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">{c.description}</p>
                  <div className="mt-4 flex items-center gap-2 text-sm font-medium text-portolan-cyan">
                    Open explorer
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </ApiKeyCheck>

        {/* Footer */}
        <footer className="pt-8 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">Portolan &middot; CC BY 4.0</p>
        </footer>
      </div>
    </div>
  );
}
