import type { Cheerio, Element } from "cheerio";
import { load } from "cheerio";
import { writeFileSync } from "fs";
import pino from "pino";
import { request } from "undici";
import URI from "urijs";

const logger = pino({ name: "lhohq-analyzer" });

interface ISite {
  images: Array<string>;
  anchors: Array<string>;
}

const sites: Record<string, ISite> = {};

async function walk(url: string) {
  if (sites[url] != undefined) return;

  logger.info("scanning ", url);

  let text;
  try {
    const response = await request(url);
    text = await response.body.text();
  } catch {
    logger.error(`request failed: ${url}`);
    return false;
  }

  if (!text) return false;

  const getUrls = (paths: Cheerio<Element>, url: string) => {
    const results: Array<string> = [];

    const getRelativePath = (urlComponent: string) => {
      let uri = new URI(urlComponent);

      if (uri.is("relative")) {
        uri = uri.absoluteTo(url);
      }

      return uri.toString();
    };

    for (const path of paths) {
      const href = path.attribs['href'];
      const src = path.attribs['src'];

      if (href != undefined) {
        if (results.includes(href)) continue;

        results.push(getRelativePath(href));
      }

      if (src != undefined) {
        if (results.includes(src)) continue;

        results.push(getRelativePath(src));
      }
    }

    return results;
  };

  const $ = load(text);
  const site = {
    images: getUrls($("img"), url),
    anchors: getUrls($("a"), url),
  };

  if (!site || sites[url] != undefined) return;

  sites[url] = site;
  logger.info(`[${Object.keys(sites).length}] update: ${url}`);

  for (const anchor of site.anchors) {
    if (!anchor.includes("lhohq.")) return;
    if (sites[anchor] != undefined) return;

    walk(anchor);
  }
}

function getDateString() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const fullYear = date.getFullYear();

  return `${month}-${day}-${fullYear}`;
}

logger.info("pages indexed: ", Object.keys(sites).length);

setInterval(() => {
  logger.info("file update");
  writeFileSync(
    `./analyzed/sites-${getDateString()}.json`,
    JSON.stringify(sites)
  );
}, 5000);

walk("http://lhohq.info");
