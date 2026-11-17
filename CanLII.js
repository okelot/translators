{
	"translatorID": "84799379-7bc5-4e55-9817-baf297d129fe",
	"label": "CanLII",
	"creator": "Sebastian Karcher",
	"target": "^https?://(www\\.)?canlii\\.org/(en|fr)/",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2026-11-16 21:40:53"
}

/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2012 Sebastian Karcher
	
	This file is part of Zotero.

	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero. If not, see <http://www.gnu.org/licenses/>.

	***** END LICENSE BLOCK *****
*/


var canLiiRegexp = /^https?:\/\/(?:www\.)?canlii\.org\/(?:en|fr)\/[^/]+\/[^/]+\/doc\//;
// Commentary documents, e.g. /fr/doctrine/doc/2025CanLIIDocs1985 or /en/commentary/doc/2025CanLIIDocs1985
var commentaryRegexp = /^https?:\/\/(?:www\.)?canlii\.org\/(?:en\/commentary|fr\/doctrine)\/doc\/([^/?#]+)/;
// Statutes and regulations, e.g. /fr/ca/legis/lois/lrc-1985-c-c-46/derniere/lrc-1985-c-c-46.html
// or /en/qc/laws/regu/cqlr-c-a-29-r-1/latest/cqlr-c-a-29-r-1.html
var legislationRegexp = /^https?:\/\/(?:www\.)?canlii\.org\/(?:fr\/[^/]+\/legis|en\/[^/]+\/laws)\/[^/]+\/[^/]+\/[^/]+\/[^/?#]+\.html/;

function clean(value) {
	return (value || "").replace(/\s+/g, " ").trim();
}

function meta(doc, name) {
	var node = doc.querySelector('meta[name="' + name + '"]');
	return node ? clean(node.getAttribute("content")) : "";
}

function metadataValue(doc, labels) {
	// Both the current Bootstrap layout and the earlier documentMeta layout.
	var nodes = doc.querySelectorAll("#metas-container .row > div:first-child, #documentMeta > div, #documentMeta .row > div:first-child");
	for (var node of nodes) {
		var label = clean(node.textContent).replace(/\s*:\s*$/, "").toLowerCase();
		if (labels.includes(label) && node.nextElementSibling) {
			return clean(node.nextElementSibling.textContent);
		}
	}
	return "";
}

function detectWeb(doc, url) {
	if (commentaryRegexp.test(url)) {
		return meta(doc, "citation_journal_title") ? "journalArticle" : "document";
	}
	if (legislationRegexp.test(url)) return "statute";
	if (canLiiRegexp.test(url)) return "case";
	for (var link of doc.querySelectorAll("a[href]")) {
		if (canLiiRegexp.test(link.href)) return "multiple";
	}
	return false;
}

function scrape(doc, url) {
	var item = new Zotero.Item("case");
	var french = /\/fr\//.test(url);
	var citationNode = doc.querySelector(".documentMeta-citation + div");
	var citation = citationNode ? clean(citationNode.textContent) : meta(doc, "DC.Title");
	var citationMatch = citation.match(/^(.+),\s*((?:18|19|20)\d{2})\s+([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Z]{2})?)\s+(\d+)(?:\s+\(([^)]+)\))?/);
	var heading = doc.querySelector("#title-container h1, #titleContainer h1, h1");
	item.caseName = meta(doc, "lbh-title") || (citationMatch ? citationMatch[1] : citation.split(",")[0]) || clean(heading && heading.textContent);
	if (!item.caseName) {
		throw new Error("CanLII case metadata is unavailable (page title: " + doc.title + ")");
	}
	item.court = metadataValue(doc, ["source", "court", "tribunal"]);
	if (!item.court) {
		var crumbs = doc.querySelectorAll('#canlii-breadcrumbs a, #breadcrumbs *[itemprop="name"]');
		if (crumbs.length > 2) item.court = clean(crumbs[2].textContent);
	}
	item.dateDecided = metadataValue(doc, ["date", "decision date", "date de la décision"]) || meta(doc, "DC.Date").slice(0, 10);
	item.docketNumber = metadataValue(doc, ["file number", "file numbers", "numéro de dossier", "numéros de dossier"]);
	var otherCitations = metadataValue(doc, ["other citation", "other citations", "autre citation", "autres citations"]);
	if (otherCitations) item.notes.push({ note: (french ? "Autres références : " : "Other Citations: ") + otherCitations });

	// Preserve existing reporter citations. Store neutral-citation numbers in
	// the native field so they survive item saving and map to CSL page.
	var reported = citation.match(/\[\d{4}\]\s+(\d+)\s+([A-Z]+)\s+(\d+)/);
	if (reported) {
		item.reporterVolume = reported[1];
		item.reporter = reported[2];
		item.firstPage = reported[3];
	}
	else if (citationMatch && citationMatch[3].toLowerCase() !== "canlii") {
		item.notes.push({ note: (french ? "Référence neutre : " : "Neutral citation: ") + citationMatch[2] + " " + citationMatch[3] + " " + citationMatch[4]
			+ (item.court ? (french ? "; Tribunal : " : "; Court: ") + item.court : "") });
		item.court = citationMatch[3];
		item.firstPage = citationMatch[4];
	}
	else if (citationMatch) {
		// Cases without a neutral citation: keep the CanLII citation in the court
		// field (e.g. "CanLII 17741 (QC CS)"), so that styles print "2000 CanLII 17741 (QC CS)".
		item.notes.push({ note: (french ? "Référence CanLII : " : "CanLII citation: ") + citationMatch[2] + " " + citationMatch[3] + " " + citationMatch[4]
			+ (citationMatch[5] ? " (" + citationMatch[5] + ")" : "")
			+ (item.court ? (french ? "; Tribunal : " : "; Court: ") + item.court : "") });
		item.court = citationMatch[3] + " " + citationMatch[4] + (citationMatch[5] ? " (" + citationMatch[5] + ")" : "");
	}
	var shortURL = doc.querySelector(".documentStaticUrl");
	item.url = shortURL ? (shortURL.getAttribute("href") || clean(shortURL.textContent)) : url.replace(/[?#].*$/, "");
	item.attachments.push({ url: url.replace(/\.html(?:[?#].*)?$/, ".pdf"), title: "CanLII Full Text PDF", mimeType: "application/pdf" });
	item.attachments.push({ document: doc, title: "CanLII Snapshot" });
	item.complete();
}

async function scrapeCommentary(doc, url) {
	var translator = Zotero.loadTranslator("web");
	// Embedded Metadata
	translator.setTranslator("951c027d-74ac-47d4-a107-9c3069ab7b48");
	translator.setDocument(doc);
	translator.setHandler("itemDone", function (obj, item) {
		item.libraryCatalog = "CanLII";
		// The page description repeats the citation; it is not an abstract.
		delete item.abstractNote;
		// The page scripts add the permalink; fall back to the page address.
		var shortURL = doc.querySelector('a[href^="https://canlii.ca/t/"]');
		item.url = shortURL ? shortURL.getAttribute("href") : url.replace(/[?#].*$/, "");
		// The full-text link is also added by the page scripts, so build the PDF
		// address from the document ID. The PDF replaces the page snapshot.
		var id = url.match(commentaryRegexp)[1];
		item.attachments = [{ url: "https://www.canlii.org/w/canlii/" + id + ".pdf", title: "CanLII Full Text PDF", mimeType: "application/pdf" }];
		item.complete();
	});
	var em = await translator.getTranslatorObject();
	await em.doWeb(doc, url);
}

function scrapeLegislation(doc, url) {
	var item = new Zotero.Item("statute");
	// The page title metadata reads "<code> | <name of act>",
	// e.g. "LRC 1985, c C-46 | Code criminel".
	var parts = meta(doc, "dc.title").split("|");
	item.nameOfAct = meta(doc, "lbh-title") || clean(parts[parts.length - 1]);
	if (parts.length > 1) item.code = clean(parts[0]);
	// dc.language follows CanLII's interface language, not the language of the text.
	var english = /^https?:\/\/(?:www\.)?canlii\.org\/en\//.test(url);
	item.language = english ? "en" : "fr";
	// Permalink to the latest version. Dated versions lack this row, so build
	// the address of the latest version instead.
	item.url = metadataValue(doc, ["lien vers la dernière version", "link to the latest version"])
		|| url.replace(/\/[^/]+\/([^/?#]+\.html)(?:[?#].*)?$/, "/" + (english ? "latest" : "derniere") + "/$1");
	// CanLII offers no PDF for legislation.
	item.attachments.push({ document: doc, title: "CanLII Snapshot" });
	item.complete();
}

async function doWeb(doc, url) {
	if (commentaryRegexp.test(url)) {
		await scrapeCommentary(doc, url);
	}
	else if (legislationRegexp.test(url)) {
		scrapeLegislation(doc, url);
	}
	else if (canLiiRegexp.test(url)) {
		scrape(doc, url);
	}
	else {
		var items = await Zotero.selectItems(ZU.getItemArray(doc, doc, canLiiRegexp));
		if (!items) return;
		for (var article of Object.keys(items)) {
			scrape(await requestDocument(article), article);
		}
	}
}

// Site language is independent of the document URL language. The French
// cases below expect the French interface selected in CanLII's language menu.

/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "https://www.canlii.org/en/ca/scc/doc/2010/2010scc2/2010scc2.html",
		"items": [
			{
				"itemType": "case",
				"caseName": "MiningWatch Canada v. Canada (Fisheries and Oceans)",
				"creators": [],
				"dateDecided": "2010-01-21",
				"court": "Supreme Court of Canada",
				"docketNumber": "32797",
				"firstPage": "6",
				"reporter": "SCR",
				"reporterVolume": "1",
				"url": "https://canlii.ca/t/27jmr",
				"attachments": [
					{
						"title": "CanLII Full Text PDF",
						"mimeType": "application/pdf"
					},
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Other Citations: 315 DLR (4th) 434 — 397 NR 232 — 99 Admin LR (4th) 1 — [2010] SCJ No 2 (QL) — [2010] ACS no 2"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/fr/ca/csc/doc/2010/2010csc2/2010csc2.html?noCache=fr",
		"items": [
			{
				"itemType": "case",
				"caseName": "Mines Alerte Canada c. Canada (Pêches et Océans)",
				"creators": [],
				"dateDecided": "2010-01-21",
				"court": "Cour suprême du Canada",
				"docketNumber": "32797",
				"firstPage": "6",
				"reporter": "RCS",
				"reporterVolume": "1",
				"url": "https://canlii.ca/t/27jms",
				"attachments": [
					{
						"title": "CanLII Full Text PDF",
						"mimeType": "application/pdf"
					},
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Autres références : 315 DLR (4th) 434 — 397 NR 232 — 99 Admin LR (4th) 1 — [2010] SCJ No 2 (QL) — [2010] ACS no 2"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/en/ca/fct/doc/2011/2011fc119/2011fc119.html",
		"items": [
			{
				"itemType": "case",
				"caseName": "Suttie v. Canada (Attorney General)",
				"creators": [],
				"dateDecided": "2011-02-02",
				"court": "FC",
				"docketNumber": "T-1089-10",
				"firstPage": "119",
				"url": "https://canlii.ca/t/2flrk",
				"attachments": [
					{
						"title": "CanLII Full Text PDF",
						"mimeType": "application/pdf"
					},
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Neutral citation: 2011 FC 119; Court: Federal Court"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/fr/ca/cfpi/doc/2011/2011cf119/2011cf119.html?noCache=fr",
		"items": [
			{
				"itemType": "case",
				"caseName": "Suttie c. Canada (Procureur Général)",
				"creators": [],
				"dateDecided": "2011-02-02",
				"court": "CF",
				"docketNumber": "T-1089-10",
				"firstPage": "119",
				"url": "https://canlii.ca/t/fks9z",
				"attachments": [
					{
						"title": "CanLII Full Text PDF",
						"mimeType": "application/pdf"
					},
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Référence neutre : 2011 CF 119; Tribunal : Cour fédérale"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/en/bc/bcca/doc/2019/2019bcca96/2019bcca96.html",
		"items": [
			{
				"itemType": "case",
				"caseName": "R. v. Pootlass",
				"creators": [],
				"dateDecided": "2019-03-18",
				"court": "BCCA",
				"docketNumber": "CA44845",
				"firstPage": "96",
				"url": "https://canlii.ca/t/hz4ml",
				"attachments": [
					{
						"title": "CanLII Full Text PDF",
						"mimeType": "application/pdf"
					},
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Other Citations: 373 CCC (3d) 433"
					},
					{
						"note": "Neutral citation: 2019 BCCA 96; Court: Court of Appeal for British Columbia"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/en/bc/bcca/doc/2019/2019bcca96/2019bcca96.html?resultId=fa395df9e9774c0fbeeac1b3eed0b75a&searchId=2026-10-09T12:34:54:405/e8eb00c58ee44b35b702ffabaa041f0c&searchUrlHash=AAAAAQAbUiB2IFBvb3RsYXNzLCAyMDE5IEJDQ0EgOTYgAAAAAAE",
		"items": [
			{
				"itemType": "case",
				"caseName": "R. v. Pootlass",
				"creators": [],
				"dateDecided": "2019-03-18",
				"court": "BCCA",
				"docketNumber": "CA44845",
				"firstPage": "96",
				"url": "https://canlii.ca/t/hz4ml",
				"attachments": [
					{
						"title": "CanLII Full Text PDF",
						"mimeType": "application/pdf"
					},
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Other Citations: 373 CCC (3d) 433"
					},
					{
						"note": "Neutral citation: 2019 BCCA 96; Court: Court of Appeal for British Columbia"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/fr/qc/qcca/doc/2026/2026qcca1417/2026qcca1417.html?noCache=fr",
		"items": [
			{
				"itemType": "case",
				"caseName": "9052-1170 Québec inc. c. Ville de Montréal",
				"creators": [],
				"dateDecided": "2026-10-26",
				"court": "QCCA",
				"docketNumber": "500-09-032018-269",
				"firstPage": "1417",
				"url": "https://canlii.ca/t/knzzg",
				"attachments": [
					{
						"title": "CanLII Full Text PDF",
						"mimeType": "application/pdf"
					},
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Référence neutre : 2026 QCCA 1417; Tribunal : Cour d'appel du Québec"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/fr/qc/qccs/doc/2000/2000canlii17741/2000canlii17741.html",
		"items": [
			{
				"itemType": "case",
				"caseName": "Malo c. Laoun",
				"creators": [],
				"dateDecided": "2000-01-12",
				"court": "CanLII 17741 (QC CS)",
				"docketNumber": "500-17-002955-980",
				"url": "https://canlii.ca/t/1kg5g",
				"attachments": [
					{
						"title": "CanLII Full Text PDF",
						"mimeType": "application/pdf"
					},
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Autres références : [2000] RJQ 458 — EYB 2000-15944"
					},
					{
						"note": "Référence CanLII : 2000 CanLII 17741 (QC CS); Tribunal : Cour supérieure du Québec"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/en/ns/nssc/doc/1990/1990canlii2604/1990canlii2604.html",
		"items": [
			{
				"itemType": "case",
				"caseName": "R. v. Nova Scotia Pharmaceutical Society",
				"creators": [],
				"dateDecided": "1990-09-05",
				"court": "CanLII 2604 (NS SCTD)",
				"docketNumber": "CR. No. 11486",
				"url": "https://canlii.ca/t/1nx16",
				"attachments": [
					{
						"title": "CanLII Full Text PDF",
						"mimeType": "application/pdf"
					},
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [
					{
						"note": "Other Citations: 73 DLR (4th) 500 — 22 ACWS (3d) 779 — 263 APR 296 — 98 NSR (2d) 296 — 59 CCC (3d) 30 — 10 WCB (2d) 578 — 32 CPR (3d) 259"
					},
					{
						"note": "CanLII citation: 1990 CanLII 2604 (NS SCTD); Court: Trial Division of the Supreme Court of Nova Scotia"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/fr/doctrine/doc/2025CanLIIDocs1985",
		"defer": true,
		"items": [
			{
				"itemType": "journalArticle",
				"title": "Contributions civilistes à l’interprétation des lois constitutionnelles canadiennes",
				"creators": [
					{
						"firstName": "Jérémy",
						"lastName": "Boulanger-Bonnelly",
						"creatorType": "author"
					}
				],
				"date": "2025",
				"issue": "2",
				"language": "fr",
				"libraryCatalog": "CanLII",
				"pages": "203",
				"publicationTitle": "Revue de droit de McGill",
				"url": "https://canlii.ca/t/8wq70",
				"volume": "70",
				"attachments": [
					{
						"title": "CanLII Full Text PDF",
						"mimeType": "application/pdf"
					}
				],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/fr/ca/legis/lois/lrc-1985-c-c-46/derniere/lrc-1985-c-c-46.html",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Code criminel",
				"creators": [],
				"code": "LRC 1985, c C-46",
				"language": "fr",
				"url": "https://canlii.ca/t/ckjd",
				"attachments": [
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/fr/qc/legis/regl/rlrq-c-a-29-r-1/derniere/rlrq-c-a-29-r-1.html",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Règlement sur l'admissibilité et l'inscription des personnes auprès de la Régie de l'assurance maladie du Québec",
				"creators": [],
				"code": "RLRQ c A-29, r 1",
				"language": "fr",
				"url": "https://canlii.ca/t/ch8d",
				"attachments": [
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://www.canlii.org/en/ca/laws/stat/rsc-1985-c-c-46/latest/rsc-1985-c-c-46.html",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Criminal Code",
				"creators": [],
				"code": "RSC 1985, c C-46",
				"language": "en",
				"url": "https://canlii.ca/t/7vf2",
				"attachments": [
					{
						"title": "CanLII Snapshot",
						"mimeType": "text/html"
					}
				],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	}
]
/** END TEST CASES **/
