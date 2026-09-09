'use client';
/** Official, creator-enabled Sketchfab embed. Model is not downloaded/rehosted. */
export function ControllerModel() {
  return (
    <div className="controller-model">
      <iframe
        title="Interactive 3D GameCube controller"
        src="https://sketchfab.com/models/21983501bac64993ac09cdc7936ffdf2/embed?autostart=1&transparent=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_help=0&ui_settings=0&ui_fullscreen=0&ui_annotations=0"
        allow="autoplay; fullscreen; xr-spatial-tracking"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <div className="model-caption">
        <span>Drag to rotate · Scroll to zoom</span>
        <a
          href="https://sketchfab.com/3d-models/gamecube-controller-21983501bac64993ac09cdc7936ffdf2"
          target="_blank"
          rel="noreferrer"
        >
          3D model by CoryRichards ↗
        </a>
      </div>
    </div>
  );
}
