// Secondary grout is measured in litres — that is what the pump reads and what the paper sheet
// (บันทึกการทำงาน Secondary Grout) keeps, in whole litres of 0–1 per hole. Primary grout is measured
// in m³ as Part A + Part B, and every chart, total and KPI in the app reads the `total` column as
// m³. So a secondary row carries both: `volumeLitre` as entered, and `total` derived from it.
//
// Rows created before the litre field existed have no `volumeLitre` and their `total` came from
// Part A + Part B. Both shapes flow through the same three helpers so the rule lives in one place:
// the record form, the data log's table, its edit modal and the analysis chart all ask here.

export const hasLitreVolume = (rec) =>
  !!rec && rec.volumeLitre !== "" && rec.volumeLitre !== null && rec.volumeLitre !== undefined;

// m³ for the shared `total` column. 1 litre = 0.001 m³ exactly.
export const secondaryTotalM3 = (rec) =>
  hasLitreVolume(rec) ? Number(rec.volumeLitre || 0) / 1000 : Number(rec.partA || 0) + Number(rec.partB || 0);

// litres, for anything that shows or plots a secondary volume on its own terms
export const secondaryLitre = (rec) =>
  hasLitreVolume(rec) ? Number(rec.volumeLitre || 0) : Number((rec && rec.total) || 0) * 1000;
