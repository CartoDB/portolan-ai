import type { Suggestion } from "@tambo-ai/react";
import { TamboProvider, useTambo, useTamboContextAttachment, useTamboThreadList } from "@tambo-ai/react";
import { TamboMcpProvider } from "@tambo-ai/react/mcp";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, MessageSquare, Plus, Share2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PortolanLogo } from "@/components/portolan-logo";
import { SettingsButton } from "@/components/settings-popover";
import { DashboardCanvas } from "@/components/tambo/dashboard-canvas";
import { useMcpServers } from "@/components/tambo/mcp-config-modal";
import { MentionChips } from "@/components/tambo/mention-chips";
import {
  MessageInput,
  MessageInputError,
  MessageInputFileButton,
  MessageInputMcpConfigButton,
  MessageInputMcpPromptButton,
  MessageInputMcpResourceButton,
  MessageInputSubmitButton,
  MessageInputTextarea,
  MessageInputToolbar,
} from "@/components/tambo/message-input";
import {
  MessageSuggestions,
  MessageSuggestionsList,
  MessageSuggestionsStatus,
} from "@/components/tambo/message-suggestions";
import { ScrollableMessageContainer } from "@/components/tambo/scrollable-message-container";
import { ThreadContent, ThreadContentMessages } from "@/components/tambo/thread-content";
import { buildTools, tamboProviderConfig } from "@/lib/tambo";
import { useReplayQueries } from "@/lib/thread-hooks";
import { useCatalogIndex } from "@/lib/use-catalog-index";
import { usePageBootstrap } from "@/lib/use-page-bootstrap";
import { useUrlParamsSync } from "@/lib/use-url-params";
import { basePath, cn } from "@/lib/utils";
import { resolveCatalog } from "@/services/catalogs";
import { buildPanelSnapshot, getActivePanels, getPanelById } from "@/services/panel-store";

/* ── Helper: extract thread preview name ──────────────────────────── */

function threadLabel(thread: { id: string; name?: string; createdAt: string }): string {
  // Use thread name if Tambo populates it
  if (thread.name?.trim()) return thread.name;
  // Fallback: short date + truncated ID
  const date = new Date(thread.createdAt);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${dateStr} - ${thread.id.substring(0, 8)}`;
}

/* ── Thread History ────────────────────────────────────────────────── */

function SessionHistory({ onClose, slug }: { onClose: () => void; slug: string }) {
  const { data, isLoading } = useTamboThreadList();
  const { currentThreadId, switchThread, startNewThread } = useTambo();

  return (
    <div className="flex flex-col h-full animate-fade-up">
      <div className="px-4 py-3 flex items-center gap-2.5">
        <Clock className="w-3.5 h-3.5 text-portolan-cyan" />
        <span className="text-xs font-semibold text-foreground tracking-wide uppercase">Sessions</span>
        <button
          onClick={() => {
            startNewThread();
            onClose();
          }}
          className="ml-auto p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          title="New session"
        >
          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="space-y-1.5 p-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : data?.threads && data.threads.length > 0 ? (
          <div className="space-y-0.5">
            {data.threads.map((thread) => (
              <div
                key={thread.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  switchThread(thread.id);
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    switchThread(thread.id);
                    onClose();
                  }
                }}
                className={`group w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer ${
                  thread.id === currentThreadId
                    ? "bg-portolan-blue/10 text-portolan-cyan border border-portolan-blue/20"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3 h-3 flex-shrink-0 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate font-semibold text-sm">{threadLabel(thread)}</span>
                    <span className="block text-[10px] text-muted-foreground/60 mt-0.5">
                      {new Date(thread.createdAt).toLocaleString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = `${window.location.origin}${basePath}/${slug}?thread=${thread.id}`;
                      navigator.clipboard.writeText(url);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted/50 transition-all flex-shrink-0"
                    title="Copy share link"
                  >
                    <Share2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center">
            <MessageSquare className="w-5 h-5 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No sessions yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Explorer Layout ───────────────────────────────────────────────── */

/** Mobile bottom sheet with swipe-to-expand/collapse via drag handle. */
function MobileBottomSheet({
  expanded,
  onToggle,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const touchStartY = useRef(0);
  const touchDeltaY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchDeltaY.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchDeltaY.current = e.touches[0].clientY - touchStartY.current;
  };

  const handleTouchEnd = () => {
    const dy = touchDeltaY.current;
    // Swipe up (negative dy) → expand, swipe down (positive dy) → collapse
    if (dy < -40 && !expanded) onToggle();
    else if (dy > 40 && expanded) onToggle();
    touchDeltaY.current = 0;
  };

  return (
    <div
      className={cn(
        "sm:hidden fixed inset-x-0 bottom-0 z-30 glass-panel transition-all duration-300 ease-out flex flex-col border-t border-border",
        expanded && "top-0",
      )}
    >
      {/* Drag handle - swipe up to expand, down to collapse, tap to toggle */}
      <div
        className="flex justify-center py-1.5 cursor-grab active:cursor-grabbing flex-shrink-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={onToggle}
      >
        <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
      </div>
      {children}
    </div>
  );
}

function ExplorerLayout({ suggestions: defaultSuggestions, slug }: { suggestions: Suggestion[]; slug: string }) {
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  // Mobile: "collapsed" = input bar at bottom, "expanded" = full-screen chat
  const [mobileChat, setMobileChat] = useState<"collapsed" | "expanded">("collapsed");
  const { messages } = useTambo();

  // Auto-expand mobile chat when a new message arrives (user submitted)
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      setMobileChat((prev) => (prev === "collapsed" ? "expanded" : prev));
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  // Auto-collapse mobile chat when a component is rendered in the dashboard
  const prevComponentCount = useRef(0);
  useEffect(() => {
    let count = 0;
    for (const msg of messages) {
      for (const block of msg.content) {
        if (block.type === "component" && block.renderedComponent) count++;
      }
    }
    if (count > prevComponentCount.current) {
      setMobileChat((prev) => (prev === "expanded" ? "collapsed" : prev));
    }
    prevComponentCount.current = count;
  }, [messages]);

  // Bidirectional URL param sync: ?thread=<id> (shared links) + ?q=<prompt>
  // (one-shot starter from the home page chips). Shared with /chat.
  useUrlParamsSync();

  // Replay SQL queries from restored thread to repopulate the query store
  useReplayQueries(messages);

  const isEmpty = useMemo(() => !messages || messages.filter((m) => m.role !== "system").length === 0, [messages]);

  // @panel mentions: nothing is written into the textarea. The panel's data snapshot
  // travels to the AI as a one-shot context attachment for the next message, and the
  // chips render straight from those attachments (the SDK clears them after send).
  const { attachments, addContextAttachment, removeContextAttachment } = useTamboContextAttachment();
  const panelAttachmentIds = useRef<Map<string, string>>(new Map());

  const panelMentions = useMemo(
    () =>
      attachments
        .filter((a) => a.type === "panel")
        .map((a) => ({ id: a.id, type: "panel", label: a.displayName ?? "Panel" })),
    [attachments],
  );

  const handleMentionPanel = useCallback(
    (panelId: string, componentName: string, title: string) => {
      const existingId = panelAttachmentIds.current.get(panelId);
      const stillAttached = existingId && attachments.some((a) => a.id === existingId);
      if (!stillAttached) {
        const panel = getPanelById(panelId) ?? { id: panelId, componentName, title };
        const attachment = addContextAttachment({
          context: `Dashboard panel the user attached to this message:\n${JSON.stringify(buildPanelSnapshot(panel), null, 2)}`,
          displayName: title || componentName,
          type: "panel",
        });
        panelAttachmentIds.current.set(panelId, attachment.id);
      }
      setIsChatOpen(true);
      setMobileChat("expanded");
    },
    [attachments, addContextAttachment],
  );

  const removeMention = useCallback(
    (attachmentId: string) => {
      removeContextAttachment(attachmentId);
    },
    [removeContextAttachment],
  );

  // Prune the panelId -> attachmentId dedup map when attachments go away
  // (chip removal or the SDK's post-send clear).
  useEffect(() => {
    for (const [panelId, attachmentId] of panelAttachmentIds.current) {
      if (!attachments.some((a) => a.id === attachmentId)) {
        panelAttachmentIds.current.delete(panelId);
      }
    }
  }, [attachments]);

  return (
    <div className="flex h-screen bg-background relative grain">
      {/* ── Desktop: side-by-side layout ─────────────────────────── */}

      {/* Chat Panel - glass sidebar (desktop only) */}
      <div
        className={`hidden sm:flex ${
          isChatOpen ? "sm:w-[400px]" : "w-0"
        } glass-panel transition-all duration-300 ease-out flex-col relative flex-shrink-0 z-20 border-r border-border`}
      >
        {isChatOpen && (
          <>
            {/* Header */}
            <div className="px-4 py-3 flex items-center gap-2.5 border-b border-border/30">
              <a
                href="https://portolan-sdi.org"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity"
              >
                <PortolanLogo size={20} />
                <h1 className="text-sm font-bold text-foreground leading-none truncate">Portolan</h1>
                <Sparkles className="w-3.5 h-3.5 text-portolan-cyan flex-shrink-0" />
              </a>
              <SettingsButton />
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-1.5 rounded-lg transition-all ${
                  showHistory ? "bg-portolan-blue/15 text-portolan-cyan" : "text-muted-foreground hover:bg-muted/50"
                }`}
                title="Sessions"
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
            </div>

            {showHistory ? (
              <SessionHistory onClose={() => setShowHistory(false)} slug={slug} />
            ) : (
              <>
                <ScrollableMessageContainer className="flex-1 px-3 py-2">
                  <ThreadContent variant="default">
                    <ThreadContentMessages />
                  </ThreadContent>
                </ScrollableMessageContainer>

                <MessageSuggestions>
                  <MessageSuggestionsStatus />
                </MessageSuggestions>

                <MessageSuggestions initialSuggestions={isEmpty ? defaultSuggestions : undefined}>
                  <MessageSuggestionsList className="px-3" />
                </MessageSuggestions>

                <div className="p-3 border-t border-border/30">
                  <MessageInput variant="bordered">
                    <MentionChips mentions={panelMentions} onRemove={removeMention} />
                    <MessageInputTextarea placeholder="Ask about weather, terrain, buildings, population..." />
                    <MessageInputToolbar>
                      <MessageInputFileButton />
                      <MessageInputMcpPromptButton />
                      <MessageInputMcpResourceButton />
                      <MessageInputMcpConfigButton />
                      <MessageInputSubmitButton />
                    </MessageInputToolbar>
                    <MessageInputError />
                  </MessageInput>
                </div>
              </>
            )}
          </>
        )}

        {/* Desktop toggle */}
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="absolute -right-7 top-1/2 -translate-y-1/2 w-6 h-10 flex items-center justify-center glass-panel-subtle rounded-r-lg z-30 hover:bg-muted/50 transition-colors"
        >
          {isChatOpen ? (
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Dashboard - all AI components become draggable/resizable panels */}
      {/* Floating toolbar passed as children - hidden when a panel is maximized */}
      <DashboardCanvas className="bg-muted/30" onMentionPanel={handleMentionPanel}>
        {mobileChat === "collapsed" && (
          <div className="sm:hidden fixed top-2 right-2 z-20 flex items-center gap-1 rounded-lg glass-panel-subtle px-1.5 py-1">
            <SettingsButton />
          </div>
        )}
      </DashboardCanvas>

      {/* ── Mobile: bottom sheet chat (2 states: collapsed / expanded) ── */}
      <MobileBottomSheet
        expanded={mobileChat === "expanded"}
        onToggle={() => setMobileChat((s) => (s === "expanded" ? "collapsed" : "expanded"))}
      >
        {/* Expanded: full-screen header with history + new thread */}
        {mobileChat === "expanded" && (
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/30 flex-shrink-0">
            <a
              href="https://portolan-sdi.org"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <PortolanLogo size={16} />
              <span className="text-xs font-bold text-foreground">Portolan</span>
              <Sparkles className="w-3 h-3 text-portolan-cyan flex-shrink-0" />
            </a>
            <span className="flex-1" />
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                showHistory ? "bg-portolan-blue/15 text-portolan-cyan" : "text-muted-foreground hover:bg-muted/50",
              )}
              title="Sessions"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
            <SettingsButton />
            <button
              onClick={() => setMobileChat("collapsed")}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/50"
              title="Minimize chat"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Messages - only when expanded */}
        {mobileChat === "expanded" && (
          <>
            {showHistory ? (
              <SessionHistory onClose={() => setShowHistory(false)} slug={slug} />
            ) : (
              <ScrollableMessageContainer className="flex-1 px-3 py-2 overflow-y-auto">
                <ThreadContent variant="default">
                  <ThreadContentMessages />
                </ThreadContent>
              </ScrollableMessageContainer>
            )}
            <MessageSuggestions>
              <MessageSuggestionsStatus />
            </MessageSuggestions>
          </>
        )}

        {/* Suggestion chips - above input for mobile visibility */}
        <MessageSuggestions initialSuggestions={isEmpty ? defaultSuggestions : undefined}>
          <MessageSuggestionsList className="px-2 pb-1" />
        </MessageSuggestions>

        {/* Input bar - always visible */}
        <div className={cn("p-2", mobileChat === "expanded" && "border-t border-border/30")}>
          <MessageInput variant="bordered">
            <MentionChips mentions={panelMentions} onRemove={removeMention} />
            <MessageInputTextarea placeholder="Ask about weather, terrain, buildings, population..." />
            <MessageInputToolbar>
              <MessageInputSubmitButton />
            </MessageInputToolbar>
            <MessageInputError />
          </MessageInput>
        </div>
      </MobileBottomSheet>
    </div>
  );
}

/* ── Panel Resources (for @-mention in chat) ─────────────────────── */

async function listPanelResources(search?: string) {
  const panels = getActivePanels();
  const items = panels.map((p) => ({
    uri: `panel://${p.componentName}/${p.id}`,
    name: `${p.title} [${p.componentName}]`,
    mimeType: "application/json",
  }));
  if (search) {
    const q = search.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }
  return items;
}

async function getPanelResource(uri: string) {
  const match = uri.match(/^panel:\/\/(\w+)\/(.+)$/);
  if (!match) return { contents: [{ uri, mimeType: "text/plain", text: `Unknown resource: ${uri}` }] };

  const [, , panelId] = match;
  const panel = getPanelById(panelId);
  if (!panel) return { contents: [{ uri, mimeType: "text/plain", text: `Panel '${panelId}' not found` }] };

  return {
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(buildPanelSnapshot(panel), null, 2) }],
  };
}

/* ── Page ──────────────────────────────────────────────────────────── */

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

export default function ExplorePage() {
  const { slug } = useParams<{ slug: string }>();
  const catalog = slug ? resolveCatalog(slug) : undefined;
  const { datasets, loading, error } = useCatalogIndex(catalog);
  const { userKey, contextHelpers, suggestions } = usePageBootstrap(catalog, datasets);
  const mcpServers = useMcpServers();
  const tools = useMemo(() => (catalog ? buildTools(catalog.slug) : []), [catalog]);

  if (!catalog) return <CatalogNotFound slug={slug} />;

  return (
    <TamboProvider
      {...tamboProviderConfig}
      tools={tools}
      mcpServers={mcpServers}
      userKey={userKey}
      contextHelpers={contextHelpers}
      listResources={listPanelResources}
      getResource={getPanelResource}
    >
      <TamboMcpProvider>
        {error && (
          <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-1rem)] glass-panel rounded-xl border border-destructive/30 px-4 py-2.5 text-sm text-foreground">
            Could not load the {catalog.title} catalog index. {error}
          </div>
        )}
        {loading && (
          <div className="fixed top-2 right-2 z-40 glass-panel-subtle rounded-lg px-3 py-1.5 text-xs text-muted-foreground">
            Loading {catalog.title} datasets...
          </div>
        )}
        <ExplorerLayout suggestions={suggestions} slug={catalog.slug} />
      </TamboMcpProvider>
    </TamboProvider>
  );
}
