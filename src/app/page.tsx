import Link from "next/link";
import MexicoExperience from "@/regions/mexico_city/MexicoExperience";

export default function Home() {
  return <main className="site-shell">
    <header className="topbar">
      <Link className="brand" href="/" aria-label="TerraWatch home"><span className="brand-mark">T</span><span>TERRAWATCH <i>FIELD NOTES 01</i></span></Link>
      <nav><Link className="active" href="/">Mexico City</Link><Link href="/data-methods">Data &amp; methods</Link></nav>
      <span className="live-chip"><b /> OBSERVATION MODE</span>
    </header>
    <section className="intro-row">
      <div><p className="eyebrow">MEXICO CITY · CENTRAL MEXICO</p><h1>The Sinking City</h1><p className="dek">A time series of ground motion across Mexico City, observed from space.</p></div>
      <div className="mission-note"><span>01 / 01</span><p>One region in focus.<br/>More places, later.</p></div>
    </section>
    <MexicoExperience />
    <footer className="site-footer"><span>TerraWatch · Understand a Changing Planet</span><span>Research preview · Observations are not damage assessments</span></footer>
  </main>;
}
