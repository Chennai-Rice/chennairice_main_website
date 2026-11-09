// City / town suggestions at checkout (Nov 2026): Tamil Nadu towns first (most of our orders), then the main
// cities of every other state. Picking one fills the state too. Anything not listed can still be typed.
const TN = `Chennai, Chengalpattu, Coimbatore, Madurai, Tiruchirappalli, Trichy, Salem, Erode, Tiruppur, Vellore, Thoothukudi,
Tirunelveli, Thanjavur, Dindigul, Kanchipuram, Cuddalore, Kumbakonam, Karur, Nagercoil, Hosur, Krishnagiri, Dharmapuri,
Namakkal, Pudukkottai, Sivakasi, Virudhunagar, Ramanathapuram, Sivaganga, Karaikudi, Theni, Nagapattinam, Mayiladuthurai,
Tiruvarur, Villupuram, Kallakurichi, Tiruvannamalai, Ranipet, Tirupattur, Ariyalur, Perambalur, Ooty, Udhagamandalam,
Coonoor, Kotagiri, Pollachi, Mettupalayam, Gobichettipalayam, Bhavani, Perundurai, Sathyamangalam, Dharapuram, Kangeyam,
Udumalaipettai, Palani, Oddanchatram, Kodaikanal, Rajapalayam, Srivilliputhur, Aruppukottai, Kovilpatti, Tiruchendur,
Tenkasi, Sankarankovil, Ambasamudram, Kanyakumari, Marthandam, Padmanabhapuram, Attur, Mettur, Omalur, Edappadi,
Rasipuram, Tiruchengode, Kumarapalayam, Pallipalayam, Ambur, Vaniyambadi, Gudiyatham, Arakkonam, Arcot, Walajapet,
Sholinghur, Tindivanam, Gingee, Panruti, Neyveli, Chidambaram, Virudhachalam, Vriddhachalam, Sirkazhi, Karaikal,
Pattukkottai, Mannargudi, Thiruthuraipoondi, Papanasam, Aranthangi, Manapparai, Musiri, Thuraiyur, Lalgudi, Srirangam,
Jayankondam, Paramakudi, Rameswaram, Devakottai, Manamadurai, Melur, Usilampatti, Thirumangalam, Periyakulam, Bodinayakanur,
Cumbum, Chinnamanur, Andipatti, Sriperumbudur, Tambaram, Avadi, Ambattur, Poonamallee, Tiruvallur, Ponneri, Gummidipoondi,
Pallavaram, Chromepet, Guduvancheri, Maraimalai Nagar, Madhuranthakam, Mamallapuram, Kelambakkam, Thiruporur,
Uthiramerur, Cheyyar, Arani, Polur, Vandavasi, Chengam, Tirukoilur, Ulundurpet, Sankarapuram, Harur, Palacode, Pennagaram,
Denkanikottai, Uthangarai, Pochampalli, Kaveripattinam, Valparai, Annur, Karamadai, Sulur, Kinathukadavu, Avinashi,
Palladam, Vellakoil, Mulanur, Kodumudi, Anthiyur, Chennimalai, Modakurichi, Nambiyur, Puliyampatti, Kulithalai,
Krishnarayapuram, Aravakurichi, Vedasandur, Natham, Nilakottai, Batlagundu, Sattur, Vembakottai, Tiruttani, Uthukottai,
Velankanni, Vedaranyam, Thiruvaiyaru, Orathanadu, Peravurani, Adirampattinam, Kayalpattinam, Ettayapuram, Vilathikulam,
Nanguneri, Valliyur, Radhapuram, Cheranmahadevi, Kadayanallur, Puliyangudi, Courtallam, Shencottai, Kuzhithurai, Colachel,
Thuckalay`

const OTHERS = {
  'Puducherry': 'Puducherry, Pondicherry, Karaikal, Mahe, Yanam',
  'Kerala': 'Thiruvananthapuram, Trivandrum, Kochi, Ernakulam, Kozhikode, Calicut, Thrissur, Kollam, Kannur, Alappuzha, Palakkad, Kottayam, Malappuram, Kasaragod, Pathanamthitta, Idukki, Wayanad, Munnar, Guruvayur',
  'Karnataka': 'Bengaluru, Bangalore, Mysuru, Mysore, Mangaluru, Mangalore, Hubballi, Dharwad, Belagavi, Belgaum, Kalaburagi, Ballari, Davanagere, Shivamogga, Tumakuru, Udupi, Hassan, Mandya, Chitradurga, Kolar, Raichur, Bidar, Vijayapura, Hosapete, Chikkamagaluru, Karwar, Madikeri',
  'Andhra Pradesh': 'Visakhapatnam, Vijayawada, Guntur, Nellore, Tirupati, Kurnool, Kakinada, Rajahmundry, Kadapa, Anantapur, Eluru, Ongole, Chittoor, Machilipatnam, Srikakulam, Vizianagaram, Hindupur, Proddatur',
  'Telangana': 'Hyderabad, Secunderabad, Warangal, Karimnagar, Nizamabad, Khammam, Ramagundam, Mahbubnagar, Nalgonda, Adilabad, Siddipet, Suryapet, Miryalaguda',
  'Maharashtra': 'Mumbai, Pune, Nagpur, Thane, Nashik, Navi Mumbai, Aurangabad, Solapur, Kolhapur, Amravati, Sangli, Latur, Jalgaon, Akola, Ahmednagar, Nanded, Satara, Ratnagiri',
  'Goa': 'Panaji, Margao, Vasco da Gama, Mapusa, Ponda',
  'Gujarat': 'Ahmedabad, Surat, Vadodara, Rajkot, Bhavnagar, Jamnagar, Gandhinagar, Junagadh, Anand, Navsari, Morbi, Bharuch, Vapi',
  'Rajasthan': 'Jaipur, Jodhpur, Udaipur, Kota, Ajmer, Bikaner, Alwar, Bhilwara, Sikar, Pali',
  'Delhi': 'New Delhi, Delhi, Dwarka, Rohini',
  'Haryana': 'Gurugram, Gurgaon, Faridabad, Panipat, Ambala, Karnal, Hisar, Rohtak, Sonipat, Panchkula',
  'Uttar Pradesh': 'Lucknow, Kanpur, Noida, Ghaziabad, Agra, Varanasi, Prayagraj, Allahabad, Meerut, Bareilly, Aligarh, Moradabad, Gorakhpur, Jhansi, Mathura, Ayodhya',
  'Punjab': 'Ludhiana, Amritsar, Jalandhar, Patiala, Bathinda, Mohali',
  'Chandigarh': 'Chandigarh',
  'Madhya Pradesh': 'Indore, Bhopal, Jabalpur, Gwalior, Ujjain, Sagar, Rewa, Satna',
  'Chhattisgarh': 'Raipur, Bhilai, Bilaspur, Korba, Durg',
  'West Bengal': 'Kolkata, Howrah, Durgapur, Asansol, Siliguri, Kharagpur, Haldia',
  'Odisha': 'Bhubaneswar, Cuttack, Rourkela, Berhampur, Sambalpur, Puri',
  'Bihar': 'Patna, Gaya, Bhagalpur, Muzaffarpur, Darbhanga',
  'Jharkhand': 'Ranchi, Jamshedpur, Dhanbad, Bokaro',
  'Assam': 'Guwahati, Dibrugarh, Silchar, Jorhat, Tezpur',
  'Uttarakhand': 'Dehradun, Haridwar, Rishikesh, Haldwani, Roorkee',
  'Himachal Pradesh': 'Shimla, Manali, Dharamshala, Solan',
  'Jammu and Kashmir': 'Srinagar, Jammu',
  'Meghalaya': 'Shillong',
  'Tripura': 'Agartala',
  'Manipur': 'Imphal',
  'Mizoram': 'Aizawl',
  'Nagaland': 'Kohima, Dimapur',
  'Arunachal Pradesh': 'Itanagar',
  'Sikkim': 'Gangtok',
  'Andaman and Nicobar Islands': 'Port Blair',
}

const split = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)
export const TOWNS = [
  ...split(TN).map((name) => ({ name, state: 'Tamil Nadu' })),
  ...Object.entries(OTHERS).flatMap(([state, list]) => split(list).map((name) => ({ name, state }))),
]

/** Towns matching what was typed: names starting with it first, then names containing it; the given state first. */
export function matchTowns(typed, state = '', limit = 8) {
  const q = String(typed || '').trim().toLowerCase()
  if (!q) return []
  const st = String(state || '').trim().toLowerCase()
  const score = (t) => {
    const n = t.name.toLowerCase()
    const pos = n.startsWith(q) ? 0 : n.includes(' ' + q) ? 1 : n.includes(q) ? 2 : 9
    return pos * 2 + (st && t.state.toLowerCase() !== st ? 1 : 0)
  }
  return TOWNS.map((t) => [score(t), t]).filter(([s]) => s < 18).sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, t]) => t)
}
