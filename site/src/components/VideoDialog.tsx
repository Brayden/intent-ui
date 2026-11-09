import { LayerDialog } from "@cloudflare/kumo/components/layer-dialog";
import { FilmSlate } from "@phosphor-icons/react";
import { DEMO_VIDEO } from "../config";

const isEmbed = (src: string) => /^https:\/\/(www\.youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(src);

/** Plays the example video in a Kumo dialog. Closing unmounts the player, which stops it. */
export function VideoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { src, poster, title, description } = DEMO_VIDEO;
  return (
    <LayerDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <LayerDialog.Content size="xl" closeLabel="Close video">
        <LayerDialog.Title>{title}</LayerDialog.Title>
        <LayerDialog.Description>{description}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className={`aspect-video w-full overflow-hidden rounded-lg border border-kumo-line ${src ? "bg-black" : "hatch bg-kumo-base"}`}>
            {!src ? (
              <div className="grid h-full place-items-center p-6">
                <div className="flex flex-col items-center gap-2 rounded-lg border border-kumo-line bg-kumo-canvas px-6 py-5 text-center">
                  <FilmSlate size={28} className="text-kumo-subtle" />
                  <p className="font-medium text-kumo-strong">Video coming soon</p>
                  <p className="text-sm text-kumo-subtle">We're recording the walkthrough now.</p>
                </div>
              </div>
            ) : isEmbed(src) ? (
              <iframe
                src={`${src}${src.includes("?") ? "&" : "?"}autoplay=1`}
                title={title}
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                className="size-full"
              />
            ) : (
              <video src={src} poster={poster} controls autoPlay playsInline preload="metadata" className="size-full">
                <track kind="captions" />
              </video>
            )}
          </div>
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
