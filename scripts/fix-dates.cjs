const fs = require('fs');
let content = fs.readFileSync('src/data/content/index.ts', 'utf8');

const newSlugs = [
  'best-real-estate-crm-ambattur-maharashtra',
  'best-real-estate-crm-avadi-maharashtra',
  'best-real-estate-crm-bachupally-hyderabad',
  'best-real-estate-crm-bheemunipatnam-maharashtra',
  'best-real-estate-crm-gachibowli-hyderabad',
  'best-real-estate-crm-gannavaram-maharashtra',
  'best-real-estate-crm-hindupur-andhra-pradesh',
  'best-real-estate-crm-hitech-city-hyderabad',
  'best-real-estate-crm-karur-maharashtra',
  'best-real-estate-crm-kokapet-hyderabad',
  'best-real-estate-crm-kompally-hyderabad',
  'best-real-estate-crm-kondapur-hyderabad',
  'best-real-estate-crm-kukatpally-hyderabad',
  'best-real-estate-crm-madhapur-hyderabad',
  'best-real-estate-crm-mangalagiri-maharashtra',
  'best-real-estate-crm-maraimalai-nagar-maharashtra',
  'best-real-estate-crm-miyapur-hyderabad',
  'best-real-estate-crm-namakkal-maharashtra',
  'best-real-estate-crm-narsingi-hyderabad',
  'best-real-estate-crm-oragadam-maharashtra',
  'best-real-estate-crm-patancheru-hyderabad',
  'best-real-estate-crm-pocharam-hyderabad',
  'best-real-estate-crm-pollachi-maharashtra',
  'best-real-estate-crm-shamshabad-hyderabad',
  'best-real-estate-crm-sriperumbudur-maharashtra',
  'best-real-estate-crm-tadepalligudem-maharashtra',
  'best-real-estate-crm-technopark-maharashtra',
  'best-real-estate-crm-tellapur-hyderabad',
  'best-real-estate-crm-tenali-andhra-pradesh',
  'best-real-estate-crm-tiruvallur-maharashtra',
  'best-real-estate-crm-tiruvannamalai-maharashtra'
];

let count = 0;
for (const slug of newSlugs) {
  // Find the slug, then find the next date field and replace it
  const escapedSlug = slug.replace(/-/g, '\\-');
  const regex = new RegExp("(slug: '" + slug + "'[\\s\\S]{1,300}?date: )'23 July 2026'");
  if (regex.test(content)) {
    content = content.replace(regex, "$1'24 July 2026'");
    count++;
  }
}

fs.writeFileSync('src/data/content/index.ts', content);
console.log('Updated ' + count + ' of ' + newSlugs.length + ' entries to 24 July 2026.');
