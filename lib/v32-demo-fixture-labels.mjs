// Localize synthetic demo fixtures by stable IDs, never by persisted user text.
// All edits continue to use the original IDs and the existing local-only state.
const LABELS={
 en:{
 'bill-electric':'Electricity bill','bill-gas':'Gas bill','bill-internet':'Fiber internet','bill-water':'Water and sewage','bill-condo':'Building fees','bill-mobile':'Mobile phone',
 'task-boiler':'Check the boiler','task-filter':'Clean the air conditioner filter','task-bins':'Take out recycling','task-windows':'Check window seals','task-meter':'Submit the water meter reading',
 'shop-milk':'Milk','shop-bread':'Bread','shop-pasta':'Pasta','shop-detergent':'Dish soap','shop-fruit':'Seasonal fruit','shop-rice':'Rice',
 'asset-boiler':'Boiler','decision-paint':'Choose a kitchen color'
 },
 es:{
 'bill-electric':'Factura de electricidad','bill-gas':'Factura de gas','bill-internet':'Internet de fibra','bill-water':'Agua y alcantarillado','bill-condo':'Gastos de comunidad','bill-mobile':'Telefonía móvil',
 'task-boiler':'Revisar la caldera','task-filter':'Limpiar el filtro del aire acondicionado','task-bins':'Sacar el reciclaje','task-windows':'Revisar las juntas de las ventanas','task-meter':'Comunicar la lectura del contador de agua',
 'shop-milk':'Leche','shop-bread':'Pan','shop-pasta':'Pasta','shop-detergent':'Lavavajillas','shop-fruit':'Fruta de temporada','shop-rice':'Arroz',
 'asset-boiler':'Caldera','decision-paint':'Elegir el color de la cocina'
 },
 fr:{
 'bill-electric':'Facture d’électricité','bill-gas':'Facture de gaz','bill-internet':'Internet fibre','bill-water':'Eau et assainissement','bill-condo':'Charges de copropriété','bill-mobile':'Téléphonie mobile',
 'task-boiler':'Vérifier la chaudière','task-filter':'Nettoyer le filtre de climatisation','task-bins':'Sortir le tri sélectif','task-windows':'Vérifier les joints des fenêtres','task-meter':'Transmettre le relevé du compteur d’eau',
 'shop-milk':'Lait','shop-bread':'Pain','shop-pasta':'Pâtes','shop-detergent':'Liquide vaisselle','shop-fruit':'Fruits de saison','shop-rice':'Riz',
 'asset-boiler':'Chaudière','decision-paint':'Choisir la couleur de la cuisine'
 },
 de:{
 'bill-electric':'Stromrechnung','bill-gas':'Gasrechnung','bill-internet':'Glasfaser-Internet','bill-water':'Wasser und Abwasser','bill-condo':'Hausgeld','bill-mobile':'Mobilfunk',
 'task-boiler':'Heizkessel prüfen','task-filter':'Klimaanlagenfilter reinigen','task-bins':'Wertstoffe hinausbringen','task-windows':'Fensterdichtungen prüfen','task-meter':'Wasserzählerstand melden',
 'shop-milk':'Milch','shop-bread':'Brot','shop-pasta':'Nudeln','shop-detergent':'Spülmittel','shop-fruit':'Saisonales Obst','shop-rice':'Reis',
 'asset-boiler':'Heizkessel','decision-paint':'Küchenfarbe auswählen'
 },
 pt:{
 'bill-electric':'Fatura de eletricidade','bill-gas':'Fatura de gás','bill-internet':'Internet por fibra','bill-water':'Água e saneamento','bill-condo':'Condomínio','bill-mobile':'Telemóvel',
 'task-boiler':'Verificar a caldeira','task-filter':'Limpar o filtro do ar condicionado','task-bins':'Levar a reciclagem','task-windows':'Verificar as vedações das janelas','task-meter':'Comunicar a leitura do contador de água',
 'shop-milk':'Leite','shop-bread':'Pão','shop-pasta':'Massa','shop-detergent':'Detergente da loiça','shop-fruit':'Fruta da época','shop-rice':'Arroz',
 'asset-boiler':'Caldeira','decision-paint':'Escolher a cor da cozinha'
 }
};
const QUANTITIES={
 en:['2 liters','1 pack','2 packs','1 bottle','1 kg','1 pack'],
 es:['2 litros','1 paquete','2 paquetes','1 botella','1 kg','1 paquete'],
 fr:['2 litres','1 paquet','2 paquets','1 flacon','1 kg','1 paquet'],
 de:['2 Liter','1 Packung','2 Packungen','1 Flasche','1 kg','1 Packung'],
 pt:['2 litros','1 embalagem','2 embalagens','1 frasco','1 kg','1 embalagem']
};
const SHOP_IDS=['shop-milk','shop-bread','shop-pasta','shop-detergent','shop-fruit','shop-rice'];
export function localizeDemoFixtures(data,language='it'){
 const labels=LABELS[language];
 if(!labels||!data)return data;
 const quantities=Object.fromEntries(SHOP_IDS.map((id,i)=>[id,QUANTITIES[language][i]]));
 const translate=(items)=>items.map(item=>({...item,title:labels[item.id]??item.title,...(item.name?{name:labels[item.id]??item.name}:{}),...(item.quantity&&quantities[item.id]?{quantity:quantities[item.id]}:{})}));
 return {...data,bills:translate(data.bills),tasks:translate(data.tasks),shopping:translate(data.shopping),assets:translate(data.assets),decisions:translate(data.decisions)};
}
