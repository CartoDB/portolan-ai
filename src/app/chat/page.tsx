import type { Suggestion } from "@tambo-ai/react";
import { TamboProvider, useTambo } from "@tambo-ai/react";
import { TamboMcpProvider } from "@tambo-ai/react/mcp";
import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { PortolanLogo } from "@/components/portolan-logo";
import { SettingsButton } from "@/components/settings-popover";
import { useMcpServers } from "@/components/tambo/mcp-config-modal";
import { MessageThreadFull } from "@/components/tambo/message-thread-full";
import { buildTools, tamboProviderConfig } from "@/lib/tambo";
import { useReplayQueries } from "@/lib/thread-hooks";
import { useCatalogIndex } from "@/lib/use-catalog-index";
import { usePageBootstrap } from "@/lib/use-page-bootstrap";
import { useUrlParamsSync } from "@/lib/use-url-params";
import { resolveCatalog } from "@/services/catalogs";

function ChatInner({ suggestions }: { suggestions: Suggestion[] }) {
  const { messages } = useTambo();

  // Shared ?thread= + ?q= URL param sync (same as /explore)
  useUrlParamsSync();

  // Replay SQL queries from restored threads to repopulate the query store
  useReplayQueries(messages);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-border bg-background px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <a
          href="https://portolan-sdi.org"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <PortolanLogo size={20} />
          <h1 className="font-bold text-sm text-foreground">Portolan</h1>
          <Sparkles className="w-3.5 h-3.5 text-portolan-cyan" />
        </a>
        <span className="text-xs text-muted-foreground hidden sm:inline">AI-powered urban intelligence</span>
        <span className="flex-1" />
        <SettingsButton />
      </header>
      <div className="flex-1 min-h-0">
        <MessageThreadFull className="max-w-4xl mx-auto h-full" initialSuggestions={suggestions} />
      </div>
    </div>
  );
}

/** Not-found state when the URL slug does not resolve to a known catalog. */
function CatalogNotFound({ slug }: { slug: string | undefined }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-6">
      <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center">
        <PortolanLogo size={40} />
        <h1 className="mt-4 text-xl font-semibold text-foreground">Catalog not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {slug ? `There is no catalog named "${slug}".` : "No catalog was specified."} Pick a catalog from the home
          page.
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm bg-portolan-blue text-white transition-all hover:brightness-110"
        >
          Back to catalogs
        </Link>
      </div>
    </div>
  );
}

export default function Chat() {
  const { slug } = useParams<{ slug: string }>();
  const catalog = slug ? resolveCatalog(slug) : undefined;
  const { datasets } = useCatalogIndex(catalog);
  const mcpServers = useMcpServers();
  const { userKey, contextHelpers, suggestions } = usePageBootstrap(catalog, datasets);
  const tools = useMemo(() => (catalog ? buildTools(catalog.slug) : []), [catalog]);

  if (!catalog) return <CatalogNotFound slug={slug} />;

  return (
    <TamboProvider
      {...tamboProviderConfig}
      tools={tools}
      mcpServers={mcpServers}
      userKey={userKey}
      contextHelpers={contextHelpers}
    >
      <TamboMcpProvider>
        <ChatInner suggestions={suggestions} />
      </TamboMcpProvider>
    </TamboProvider>
  );
}
