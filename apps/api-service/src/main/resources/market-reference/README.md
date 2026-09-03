# UK DEFRA wholesale reference series

AgriLoop uses this small attributed extract only as an international reference
curve when the local Chongqing archive is too short to make a useful chart.
It never replaces, interpolates, or contributes to the local quotation,
moving average, market comparison, or sales observation.

- Publisher: UK Department for Environment, Food & Rural Affairs (DEFRA)
- Dataset: Wholesale fruit and vegetable prices
- Source page: https://www.gov.uk/government/statistical-data-sets/wholesale-fruit-and-vegetable-prices-weekly-average
- Source CSV: https://assets.publishing.service.gov.uk/media/6a7eec530ad4bc475be7de96/fruitvegprices-260817.csv
- Source CSV SHA-256: `6FE0B1496866DC200A73B5FF593FEE93CD87C78F7C7941C0E1FE9F994072CE95`
- Retrieved: 2026-09-01
- Published through: 2026-08-17
- Licence: Open Government Licence v3.0
- Licence URL: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

Transformation: filter records from 2025-09-01 onward to exact crop/variety
pairs `tomatoes/round`, `cucumbers/cucumbers`, `capsicum/green`, and
`strawberries/strawberries`; retain only records whose original unit is `kg`;
rename the original `price` to the API point price without currency conversion.
Missing publication dates remain missing and must render as chart gaps.
