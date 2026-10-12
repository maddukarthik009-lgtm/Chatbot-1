import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { useSendChatMessage } from '@workspace/api-client-react';
import type { ChatMessage } from '@workspace/api-client-react';
import { ArrowUp, Compass, Lightbulb, ListChecks, Plus, Sparkles } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [hasError, setHasError] = useState(false);
  const [lastRequest, setLastRequest] = useState<ChatMessage[] | null>(null);
  const mutation = useSendChatMessage();
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationVersion = useRef(0);
  const isEmpty = messages.length === 0;
  const isPending = mutation.isPending;

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isPending, hasError]);

  const sendRequest = (request: ChatMessage[], version: number) => {
    mutation.mutate(
      { data: { messages: request } },
      {
        onSuccess: (response) => {
          if (version !== conversationVersion.current) return;
          setMessages((current) => [...current, { role: 'assistant', content: response.reply }]);
          setHasError(false);
          setLastRequest(null);
        },
        onError: () => {
          if (version !== conversationVersion.current) return;
          setHasError(true);
        },
      },
    );
  };

  const submitMessage = (value: string) => {
    const content = value.trim();
    if (!content || isPending || content.length > 6000) return;

    const userMessage: ChatMessage = { role: 'user', content };
    const updated = [...messages, userMessage];
    const request = updated.slice(-24);
    setMessages(updated);
    setDraft('');
    setHasError(false);
    setLastRequest(request);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    sendRequest(request, conversationVersion.current);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitMessage(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitMessage(draft);
    }
  };

  const beginFreshChat = () => {
    conversationVersion.current += 1;
    setMessages([]);
    setDraft('');
    setHasError(false);
    setLastRequest(null);
    mutation.reset();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    textareaRef.current?.focus();
  };

  const retry = () => {
    if (!lastRequest || isPending) return;
    setHasError(false);
    sendRequest(lastRequest, conversationVersion.current);
  };

  const ideas = [
    { icon: Compass, text: 'Help me think through a decision I’m facing' },
    { icon: Lightbulb, text: 'Explain a tricky idea in a simple way' },
    { icon: ListChecks, text: 'Turn a big goal into a clear first step' },
    { icon: Sparkles, text: 'Help me find a fresh angle on a problem' },
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Kindred, thinking partner">
          <div className="brand-mark"><Sparkles size={17} strokeWidth={1.8} /></div>
          <div>
            <div className="brand-name">kindred</div>
            <div className="brand-caption">a thinking partner</div>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="session-note"><span className="session-dot" /> Your conversation stays here for this session</span>
          <button className="new-chat" type="button" onClick={beginFreshChat} data-testid="button-new-chat">
            <Plus size={15} strokeWidth={2} />
            <span>New chat</span>
          </button>
        </div>
      </header>

      <section className="conversation" aria-label="Chat with Kindred">
        <div className="chat-scroll">
          {isEmpty ? (
            <div className="welcome">
              <div className="welcome-kicker">A little room to think</div>
              <h1>Let’s make sense<br />of <span>what’s on your mind.</span></h1>
              <p className="welcome-copy">Bring a question, a half-formed thought, or a knot you can’t quite untangle. We’ll work through it together.</p>
              <div className="prompt-grid" aria-label="Ideas to get started">
                {ideas.map(({ icon: IdeaIcon, text }, index) => (
                  <button
                    className="prompt-card"
                    type="button"
                    key={text}
                    onClick={() => submitMessage(text)}
                    data-testid={`button-prompt-${index + 1}`}
                  >
                    <span>{text}</span>
                    <IdeaIcon size={16} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list" aria-live="polite">
              {messages.map((message, index) => (
                <article className={`message-row ${message.role}`} key={`${index}-${message.role}`} data-testid={`message-${message.role}-${index}`}>
                  {message.role === 'assistant' && (
                    <div className="assistant-mark" aria-hidden="true"><Sparkles size={14} strokeWidth={1.8} /></div>
                  )}
                  <div className="message-content">
                    <div className="message-meta">{message.role === 'user' ? 'You' : 'Kindred'}</div>
                    <div className="message-text" data-testid={`text-message-${index}`}>{message.content}</div>
                  </div>
                </article>
              ))}
              {isPending && (
                <div className="message-row assistant" role="status" aria-label="Kindred is thinking" data-testid="status-pending">
                  <div className="assistant-mark" aria-hidden="true"><Sparkles size={14} strokeWidth={1.8} /></div>
                  <div className="message-content">
                    <div className="message-meta">Kindred</div>
                    <div className="typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}
              {hasError && (
                <div className="message-error" role="alert" data-testid="status-error">
                  <span>That didn’t come through. Your message is still here.</span>
                  <button type="button" className="retry-button" onClick={retry} data-testid="button-retry">Try again</button>
                </div>
              )}
              <div ref={scrollAnchorRef} />
            </div>
          )}
          {isEmpty && <div ref={scrollAnchorRef} />}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="chat-input">Write a message</label>
            <textarea
              id="chat-input"
              ref={textareaRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                event.target.style.height = 'auto';
                event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="What would you like to think through?"
              rows={1}
              maxLength={6000}
              disabled={isPending}
              data-testid="input-chat-message"
            />
            <div className="composer-bottom">
              <span className="composer-hint">{draft.length > 0 ? `${draft.length.toLocaleString()} / 6,000` : 'Enter to send · Shift + Enter for a new line'}</span>
              <button className="send-button" type="submit" aria-label="Send message" disabled={!draft.trim() || isPending} data-testid="button-send-message">
                <ArrowUp size={18} strokeWidth={2.2} />
              </button>
            </div>
          </form>
          <div className="composer-footnote">A thoughtful start is enough. You can always add more context.</div>
        </div>
      </section>
    </main>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
