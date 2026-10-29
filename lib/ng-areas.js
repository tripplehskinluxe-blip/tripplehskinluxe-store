// Delivery states, and popular towns / areas for each one.
// The area lists are SUGGESTIONS for the checkout form. Customers can always type any place that is not listed.
export const STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT - Abuja','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'];

export const AREAS = {
  'Abia': ['Aba', 'Arochukwu', 'Bende', 'Isiala Ngwa', 'Isuikwuato', 'Obingwa', 'Ohafia', 'Osisioma', 'Ukwa', 'Umuahia', 'Umunneochi'],
  'Adamawa': ['Ganye', 'Girei', 'Gombi', 'Hong', 'Jimeta', 'Mayo-Belwa', 'Michika', 'Mubi', 'Numan', 'Song', 'Yola'],
  'Akwa Ibom': ['Abak', 'Eket', 'Etinan', 'Ibeno', 'Ikot Abasi', 'Ikot Ekpene', 'Itu', 'Mkpat Enin', 'Oron', 'Uyo'],
  'Anambra': ['Agulu', 'Amawbia', 'Awka', 'Ekwulobia', 'Ihiala', 'Nkpor', 'Nnewi', 'Oba', 'Obosi', 'Ogidi', 'Onitsha', 'Otuocha', 'Ozubulu'],
  'Bauchi': ['Alkaleri', 'Azare', 'Bauchi', 'Dass', 'Gamawa', 'Jama\'are', 'Katagum', 'Misau', 'Ningi', 'Tafawa Balewa'],
  'Bayelsa': ['Amassoma', 'Brass', 'Ekeremor', 'Kaiama', 'Nembe', 'Ogbia', 'Sagbama', 'Southern Ijaw', 'Yenagoa'],
  'Benue': ['Adikpo', 'Aliade', 'Gboko', 'Katsina-Ala', 'Makurdi', 'Oju', 'Otukpo', 'Vandeikya', 'Zaki Biam'],
  'Borno': ['Bama', 'Biu', 'Damboa', 'Dikwa', 'Gwoza', 'Konduga', 'Maiduguri', 'Monguno'],
  'Cross River': ['Akamkpa', 'Bekwarra', 'Calabar', 'Ikom', 'Obubra', 'Obudu', 'Odukpani', 'Ogoja', 'Ugep'],
  'Delta': ['Abraka', 'Agbor', 'Asaba', 'Burutu', 'Effurun', 'Koko', 'Kwale', 'Ogwashi-Uku', 'Oghara', 'Orerokpe', 'Ozoro', 'Sapele', 'Ughelli', 'Warri'],
  'Ebonyi': ['Abakaliki', 'Afikpo', 'Amasiri', 'Ezzamgbo', 'Ikwo', 'Ishiagu', 'Ohaozara', 'Onueke'],
  'Edo': ['Agenebode', 'Auchi', 'Benin City', 'Ekpoma', 'Igarra', 'Irrua', 'Okada', 'Sabongida-Ora', 'Ubiaja', 'Ugbowo', 'Uromi'],
  'Ekiti': ['Ado-Ekiti', 'Aramoko-Ekiti', 'Efon-Alaaye', 'Emure-Ekiti', 'Ido-Ekiti', 'Ijero-Ekiti', 'Ikere-Ekiti', 'Ikole-Ekiti', 'Ilawe-Ekiti', 'Ise-Ekiti', 'Omuo-Ekiti', 'Oye-Ekiti'],
  'Enugu': ['Abakpa Nike', 'Agbani', 'Awgu', 'Emene', 'Enugu', 'GRA Enugu', 'Independence Layout', 'Ninth Mile', 'Nsukka', 'Obiagu', 'Ogui', 'Oji River', 'Trans-Ekulu', 'Udi', 'Uwani'],
  'FCT - Abuja': ['Abaji', 'Apo', 'Asokoro', 'Bwari', 'Dei-Dei', 'Durumi', 'Dutse', 'Galadimawa', 'Garki', 'Gwagwalada', 'Gwarinpa', 'Idu', 'Jabi', 'Jahi', 'Kado', 'Karu', 'Katampe', 'Kubwa', 'Kuje', 'Kwali', 'Life Camp', 'Lokogoma', 'Lugbe', 'Maitama', 'Mpape', 'Nyanya', 'Utako', 'Wuse', 'Wuse 2', 'Wuye', 'Zuba'],
  'Gombe': ['Akko', 'Bajoga', 'Billiri', 'Deba', 'Dukku', 'Gombe', 'Kaltungo', 'Kumo', 'Nafada', 'Yamaltu'],
  'Imo': ['Egbu', 'Ideato', 'Ihiagwa', 'Mbieri', 'Naze', 'Nekede', 'Ngor Okpala', 'Nkwerre', 'Oguta', 'Ohaji', 'Okigwe', 'Orji', 'Orlu', 'Owerri'],
  'Jigawa': ['Babura', 'Birnin Kudu', 'Dutse', 'Gumel', 'Gwaram', 'Hadejia', 'Kazaure', 'Kiyawa', 'Maigatari', 'Ringim'],
  'Kaduna': ['Barnawa', 'Birnin Gwari', 'Giwa', 'Kachia', 'Kafanchan', 'Kagoro', 'Kaduna', 'Kawo', 'Makarfi', 'Rigasa', 'Sabon Gari', 'Sabon Tasha', 'Samaru', 'Soba', 'Ungwan Rimi', 'Zaria'],
  'Kano': ['Bichi', 'Dala', 'Dawakin Tofa', 'Fagge', 'Gaya', 'Gwale', 'Hotoro', 'Kano', 'Kumbotso', 'Kurna', 'Nassarawa', 'Rano', 'Sabon Gari', 'Tarauni', 'Ungogo', 'Wudil'],
  'Katsina': ['Bakori', 'Dutsin-Ma', 'Daura', 'Funtua', 'Kafur', 'Kankia', 'Katsina', 'Malumfashi', 'Mani', 'Mashi'],
  'Kebbi': ['Argungu', 'Bagudo', 'Birnin Kebbi', 'Bunza', 'Gwandu', 'Jega', 'Kalgo', 'Koko', 'Yauri', 'Zuru'],
  'Kogi': ['Ajaokuta', 'Ankpa', 'Anyigba', 'Dekina', 'Egbe', 'Idah', 'Isanlu', 'Kabba', 'Koton Karfe', 'Lokoja', 'Okene', 'Ogori'],
  'Kwara': ['Ajasse-Ipo', 'Erin-Ile', 'Fate', 'Ilorin', 'Jebba', 'Kaiama', 'Lafiagi', 'Offa', 'Oke-Ode', 'Omu-Aran', 'Oloje', 'Patigi', 'Sango', 'Share', 'Tanke'],
  'Lagos': ['Abraham Adesanya', 'Agege', 'Aguda', 'Ago Palace Way', 'Agidingbi', 'Ajah', 'Ajao Estate', 'Ajegunle', 'Akoka', 'Alausa', 'Alimosho', 'Amuwo Odofin', 'Anthony', 'Apapa', 'Awoyaya', 'Badagry', 'Bariga', 'Berger', 'Bode Thomas', 'Chevron', 'Ebute Metta', 'Egbeda', 'Ejigbo', 'Epe', 'Fadeyi', 'Festac Town', 'Gbagada', 'Idimu', 'Igando', 'Ifako-Ijaiye', 'Ijesha', 'Ikeja', 'Ikeja GRA', 'Ikorodu', 'Ikotun', 'Ikoyi', 'Ilasamaja', 'Ilupeju', 'Ipaja', 'Isolo', 'Itire', 'Iyana Ipaja', 'Iyana Oworo', 'Ketu', 'Lagos Island', 'Lawanson', 'Lekki', 'Lekki Phase 1', 'Magodo', 'Maryland', 'Mile 12', 'Mushin', 'Obalende', 'Ogba', 'Ogudu', 'Ojodu', 'Ojo', 'Ojota', 'Ojuelegba', 'Okota', 'Omole', 'Oniru', 'Oshodi', 'Oworonshoki', 'Oyingbo', 'Palmgrove', 'Sangotedo', 'Satellite Town', 'Shomolu', 'Surulere', 'Victoria Island', 'Yaba'],
  'Nasarawa': ['Akwanga', 'Awe', 'Doma', 'Keffi', 'Karu', 'Lafia', 'Mararaba', 'Masaka', 'Nasarawa', 'New Karu', 'Toto', 'Uke', 'Wamba'],
  'Niger': ['Agaie', 'Baro', 'Bida', 'Kontagora', 'Lapai', 'Minna', 'Mokwa', 'New Bussa', 'Suleja', 'Tegina', 'Zungeru'],
  'Ogun': ['Abeokuta', 'Ago-Iwoye', 'Agbara', 'Ayetoro', 'Ewekoro', 'Ibafo', 'Idiroko', 'Ifo', 'Ijebu-Igbo', 'Ijebu-Ode', 'Ilaro', 'Iperu', 'Itori', 'Mowe', 'Odeda', 'Ogere-Remo', 'Ota', 'Papalanto', 'Sagamu'],
  'Ondo': ['Akure', 'Idanre', 'Igbokoda', 'Ikare-Akoko', 'Ode-Irele', 'Okitipupa', 'Ondo Town', 'Ore', 'Owo'],
  'Osun': ['Ede', 'Ejigbo', 'Gbongan', 'Ila-Orangun', 'Ikire', 'Ikirun', 'Ile-Ife', 'Ilesa', 'Ilobu', 'Ipetumodu', 'Iree', 'Iwo', 'Modakeke', 'Osogbo'],
  'Oyo': ['Agodi', 'Akobo', 'Apata', 'Bodija', 'Challenge', 'Dugbe', 'Egbeda', 'Eruwa', 'Ibadan', 'Igbo-Ora', 'Igboho', 'Iseyin', 'Iwo Road', 'Lanlate', 'Moniya', 'Mokola', 'Ogbomosho', 'Oluyole', 'Oyo', 'Ring Road', 'Saki'],
  'Plateau': ['Barkin Ladi', 'Bassa', 'Bukuru', 'Jos', 'Jos North', 'Jos South', 'Langtang', 'Mangu', 'Pankshin', 'Riyom', 'Shendam', 'Vom', 'Wase'],
  'Rivers': ['Ahoada', 'Bonny', 'Bori', 'Borokiri', 'Choba', 'D-Line', 'Degema', 'Diobu', 'Elelenwo', 'Eleme', 'Emohua', 'GRA Phase 1', 'GRA Phase 2', 'Ikwerre', 'Obio-Akpor', 'Okrika', 'Omoku', 'Oyigbo', 'Peter Odili Road', 'Port Harcourt', 'Rumuigbo', 'Rumuokoro', 'Rumuola', 'Rumuomasi', 'Stadium Road', 'Trans Amadi', 'Woji'],
  'Sokoto': ['Bodinga', 'Gada', 'Goronyo', 'Gwadabawa', 'Illela', 'Kebbe', 'Rabah', 'Sokoto', 'Tambuwal', 'Wurno'],
  'Taraba': ['Bali', 'Gembu', 'Ibi', 'Jalingo', 'Lau', 'Mutum Biyu', 'Serti', 'Takum', 'Wukari', 'Zing'],
  'Yobe': ['Bade', 'Buni Yadi', 'Damaturu', 'Fika', 'Gashua', 'Geidam', 'Gujba', 'Nguru', 'Potiskum', 'Yusufari'],
  'Zamfara': ['Anka', 'Bungudu', 'Gummi', 'Gusau', 'Kaura Namoda', 'Maru', 'Shinkafi', 'Talata Mafara', 'Tsafe', 'Zurmi'],
};

const NONE = [];
export const areasFor = (state) => AREAS[state] || NONE;

// Used by the server at checkout: is the typed city a known place in a DIFFERENT state than the one the customer chose?
// Returns those other states, or [] when nothing looks wrong. Places we do not list are fine: customers can type anything.
export function otherStatesFor(state, city) {
  const c = String(city || '').trim().toLowerCase();
  if (!c) return [];
  if ((AREAS[state] || []).some((a) => a.toLowerCase() === c)) return [];
  return STATES.filter((s) => s !== state && (AREAS[s] || []).some((a) => a.toLowerCase() === c));
}
