import Link from "next/link";
import SpaceDemo from "@/regions/mexico_city/SpaceDemo";

export default function DemoPage() {
  return <main className="site-shell space-shell">
    <header className="topbar">
      <Link className="brand" href="/" aria-label="TerraWatch home"><span className="brand-mark">T</span><span>TERRAWATCH <i>ORBITAL CONSOLE</i></span></Link>
      <nav><Link href="/">Earth observatory</Link><Link className="active" href="/demo">Space demo</Link><Link href="/data-methods">Data &amp; methods</Link></nav>
      <span className="live-chip"><b /> SIMULATION</span>
    </header>
    <SpaceDemo />
    <footer className="site-footer"><span>TerraWatch · Orbital console concept</span><span>Demo telemetry is simulated · No live spacecraft connection</span></footer>
  </main>;
}
