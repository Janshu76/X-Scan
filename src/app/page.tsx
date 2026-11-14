import Link from "next/link";
import MexicoExperience from "@/regions/mexico_city/MexicoExperience";
import { RegionCards } from "@/regions/mexico_city/ProductFeatures";
import RegionHeroMetadata from "@/regions/mexico_city/RegionHeroMetadata";

export default function Home() {
  return <main className="site-shell space-shell observatory-shell">
    <header className="topbar">
      <Link className="brand" href="/" aria-label="TerraWatch home"><span className="brand-mark">T</span><span>TERRAWATCH <i>FIELD NOTES 01</i></span></Link>
      <nav><Link className="active" href="/">Observatory</Link><Link href="/demo">Mission control</Link><Link href="/data-methods">Data &amp; methods</Link></nav>
      <span className="live-chip"><b /> OBSERVATION MODE</span>
    </header>
    <section className="space-hero observatory-hero">
      <div><p className="eyebrow">EARTH OBSERVATION · MEXICO CITY</p><h1>Reading the Earth<br/><em>from orbit.</em></h1><p className="dek">Follow the slow motion beneath Mexico City through the available Sentinel-1 radar observations.</p><div className="hero-actions"><a href="#observation">Explore the observation <span>↓</span></a><Link href="/data-methods">How this data works ↗</Link></div><RegionHeroMetadata /></div>
      <div className="hero-orbit observatory-orbit" aria-hidden="true"><span className="orbit-ring ring-one"/><span className="orbit-ring ring-two"/><span className="orbit-earth"/><span className="orbit-satellite">✦</span><span className="orbit-dot"/><RegionHeroMetadata coordinateOnly/><span className="orbit-caption">MEXICO CITY BASIN · REFERENCE WINDOW</span></div>
      <div className="demo-stamp"><span>FIELD NOTE</span><b>01—01</b><small>OBSERVED FROM SPACE</small></div>
    </section>
    <div id="observation"><MexicoExperience /></div>
    <RegionCards />
    <footer className="site-footer"><span>TerraWatch · Understand a Changing Planet</span><span>Research preview · Observations are not damage assessments</span></footer>
  </main>;
}
