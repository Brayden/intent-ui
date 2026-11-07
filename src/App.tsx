import { Empty } from "@cloudflare/kumo/components/empty";
import { Toasty } from "@cloudflare/kumo/components/toast";
import { useRoute } from "./app/router";
import { ConfirmProvider } from "./lib/confirm";
import { HomePage } from "./features/home";
import { WorkspacePage } from "./features/workspace";

function Routes() {
  const route = useRoute();
  if (route.name === "home") return <HomePage />;
  if (route.name === "workspace") return <WorkspacePage key={route.id} id={route.id} pageId={route.pageId} params={route.params} />;
  return <Empty title="Page not found" />;
}

export default function App() {
  return (
    <main className="min-h-screen bg-kumo-canvas">
      <Toasty>
        <ConfirmProvider>
          <Routes />
        </ConfirmProvider>
      </Toasty>
    </main>
  );
}
