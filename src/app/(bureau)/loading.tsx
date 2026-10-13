export default function Chargement() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Chargement">
      <div className="flex items-center gap-4">
        <div className="squelette h-12 w-12 rounded-2xl" />
        <div className="grid gap-2">
          <div className="squelette h-7 w-56" />
          <div className="squelette h-4 w-80 max-w-[60vw]" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="carte grid gap-3">
            <div className="squelette h-4 w-24" />
            <div className="squelette h-7 w-36" />
            <div className="squelette h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="carte lg:col-span-2">
          <div className="squelette h-56 w-full" />
        </div>
        <div className="carte grid gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="squelette h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
