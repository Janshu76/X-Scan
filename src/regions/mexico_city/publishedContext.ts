export type PublishedEntry = { id: string; period: string; title: string; detail: string; href: string; source: string; resolution: string; license: string };

export const publishedContext: PublishedEntry[] = [
  {
    id: "long-term-five-sensors",
    period: "2004 to 2018",
    title: "Long-term InSAR from five radar sensors",
    source: "Land Degradation & Development · DOI 10.1002/ldr.3347",
    resolution: "Not applicable (published study)",
    license: "Publication reuse terms not recorded here",
    detail: "A long-term InSAR study combining ENVISAT, ALOS-1, COSMO-SkyMed, ALOS-2 and Sentinel-1 reported a maximum cumulative subsidence of more than 4.5 m over about 15 years in Mexico City.",
    href: "https://doi.org/10.1002/ldr.3347",
  },
  {
    id: "sierra-de-santa-catarina",
    period: "2014 to 2017",
    title: "Differential subsidence around Sierra de Santa Catarina",
    source: "Proceedings of the IAHS, volume 382 (2020), pages 173 onward",
    resolution: "Not applicable (published study)",
    license: "Publication reuse terms not recorded here",
    detail: "Sentinel-1 InSAR around Sierra de Santa Catarina in southern Mexico City reported rates of about −400 mm/yr in the surrounding subsiding areas while the hills themselves were stable.",
    href: "https://doi.org/10.5194/piahs-382-173-2020",
  },
  {
    id: "cigna-tapete",
    period: "2014 to 2020",
    title: "Cigna and Tapete (2021), Remote Sensing of Environment 253",
    source: "Remote Sensing of Environment 253 · DOI 10.1016/j.rse.2020.112161",
    resolution: "Not applicable (published study)",
    license: "Publication reuse terms not recorded here",
    detail: "Used Sentinel-1 InSAR to map present-day subsidence and compared the InSAR time series with GPS data.",
    href: "https://doi.org/10.1016/j.rse.2020.112161",
  },
];

export const publishedContextClosing = "This project's observations (March 2022 to February 2026) are a different statistic over a different period and are not directly comparable to these figures.";
