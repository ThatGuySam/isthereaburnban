type MunicipalCode = {
  id: string;
  county: string;
  publisher: string;
  chapter: string;
  sections: readonly string[];
  digest: string;
  label: string;
  note: string;
};

export const paMunicipalCodes: readonly MunicipalCode[] = [
  {
    id: "towanda-burning", county: "Bradford", publisher: "Towanda Borough",
    chapter: "14272148", sections: ["16063094"],
    digest: "49261aa021add06c16cfe6de4f103da26775cd94d31a71d3c8045ec0351d5e55",
    label: "Open burning limited by borough ordinance",
    note: "Towanda Code § 253-7 prohibits open burning of leaves, weeds and grass clippings, along with specified waste. The section regulates recreational fires and lists exceptions for certain other burns.",
  },
  {
    id: "clarion-burning", county: "Clarion", publisher: "Clarion Borough",
    chapter: "27387108", sections: ["27387109"],
    digest: "2bc6e77820a544fd780910ab8ff6d4a70749e8a30d2c93e0072c2a2dafa67c4c",
    label: "Outdoor burning limited by borough ordinance",
    note: "Clarion Code § 71-2 generally requires a compliant outdoor fire device and prohibits burning directly on the ground or burning yard waste, except small dried branches used for kindling. It lists exceptions and approval requirements.",
  },
  {
    id: "dubois-burning", county: "Clearfield", publisher: "City of DuBois",
    chapter: "14005685", sections: ["14005693", "14005697"],
    digest: "25c15745ef55804f876c218b21699fce84dd6de06325aeed9ffff0395f26bf8c",
    label: "Refuse burning prohibited and covered vegetation burns require approval",
    note: "DuBois Code §§ 154-2 and 154-3 prohibit open fires for disposing of refuse or for salvage. Covered burns of branches and other eligible vegetation require prior written approval from the city's Fire Chief and must meet the ordinance's conditions.",
  },
  {
    id: "bloomsburg-burning", county: "Columbia", publisher: "Town of Bloomsburg",
    chapter: "37004592", sections: ["37004570", "37004587", "37004599", "37004600"],
    digest: "05940181087965f08c69060dee261c1fb917e56c30c1ad3a0c5d1e6c42663a5e",
    label: "Outdoor fires and bonfires limited by town ordinance",
    note: "Bloomsburg Code §§ 10-302 and 10-304 through 10-306 limit fuel, size and hours for ordinary fires on private property. Bonfires have separate written approval and location requirements. Covered fires on town property require permission from the Chief of Police.",
  },
  {
    id: "huntingdon-burning", county: "Huntingdon", publisher: "Huntingdon Borough",
    chapter: "31386164", sections: ["31386148", "31386162"],
    digest: "000306bf989301dae8cac591f2da77c572e276b038ec9fd3def6861db0a5e2b2",
    label: "Outdoor burning limited by borough ordinance",
    note: "Huntingdon Code § 7-302 generally prohibits outdoor burning. Recreational fires in approved containers and bonfires approved by the Mayor are exceptions.",
  },
  {
    id: "indiana-borough-burning", county: "Indiana", publisher: "Indiana Borough",
    chapter: "26868512", sections: ["26868513", "26868516", "26868517"],
    digest: "84fb5d2fa9c19edf8bcb76552833051fadbb283dc0cb654525de3196a87d0d9d",
    label: "Borough consent required for covered outdoor fires",
    note: "Indiana Borough Code §§ 212-1, 212-3 and 212-4 require prior consent from the Borough Manager or designee for covered outdoor fires and limit them to untreated wood. Cooking fires in qualifying fixtures follow separate rules.",
  },
  {
    id: "punxsutawney-burning", county: "Jefferson", publisher: "Punxsutawney Borough",
    chapter: "11592461", sections: ["11592449"],
    digest: "5a27234375b091e35a0cfffac6e273ba901b2d41fce3f1b05027f54449fbef5e",
    label: "Open burning limited by borough ordinance",
    note: "Punxsutawney Code § 97-5 prohibits open burning including yard waste and domestic refuse. Listed exceptions other than cooking generally require state approval and a borough open-burning permit.",
  },
  {
    id: "loyalsock-burning", county: "Lycoming", publisher: "Loyalsock Township",
    chapter: "13036035", sections: ["13036034", "13036035", "13036042", "13036043", "13036044", "13331644", "13331645", "13331649"],
    digest: "664015f44b1897370e9b6633c28d947539345e623d3948a871663674d374108b",
    label: "Outdoor burning limited by township ordinance",
    note: "Loyalsock Code Chapter 94 generally prohibits outdoor burning including brush and yard debris. It allows qualifying recreational and cooking fires and lists separate conditions for approved burns and limited paper burning.",
  },
  {
    id: "lewistown-burning", county: "Mifflin", publisher: "Lewistown Borough",
    chapter: "28668919", sections: ["28668932"],
    digest: "047638fd5f8094eba024fcb7d1a64a48be6dfc41caf5751c752f6dfad9b258a6",
    label: "Outdoor burning limited by borough ordinance",
    note: "Lewistown Code § 110-32 generally prohibits open fires outdoors. It gives exceptions for certain activities under the Fire Prevention Code, approved and supervised organizational bonfires and specified burning in approved incinerators.",
  },
  {
    id: "east-stroudsburg-burning", county: "Monroe", publisher: "East Stroudsburg Borough",
    chapter: "12386954", sections: ["12386955", "12386960", "12386961"],
    digest: "0d9a75f166f4293fdd74f790e0e8e5295d5d8cb365c3099fa5081b6581f91e25",
    label: "Open burning limited by borough ordinance",
    note: "East Stroudsburg Code §§ 71-1 through 71-3 generally prohibit open fires. The section lists exceptions including covered outdoor barbecues, approved public events and official fire-safety activities.",
  },
  {
    id: "mahoning-montour-burning", county: "Montour", publisher: "Mahoning Township",
    chapter: "12423811", sections: ["7260569", "7260586", "7260590"],
    digest: "e4e52ff67e585074974b123f5628d236e174f88744f4e75b2e07d3e1c6380586",
    label: "Outdoor burning limited by township ordinance",
    note: "Mahoning Township Code §§ 104-3, 104-6 and 104-8 restrict open refuse fires and list prohibited materials. The ordinance lists limited exceptions and restricts covered outdoor fires to 7 a.m. to 4 p.m. on Tuesdays, Thursdays and Saturdays, excluding holidays.",
  },
  {
    id: "sunbury-burning", county: "Northumberland", publisher: "City of Sunbury",
    chapter: "28785032", sections: ["28785040"],
    digest: "39283bd8a1f59db58b1fcfe66af7760accbe23c94353267d0cc4f0844ea9600a",
    label: "Outdoor burning limited by city ordinance",
    note: "Sunbury Code § 53-11 restricts outdoor fires to compliant containers and prohibits burning yard waste and specified materials. Bonfires in public places require permission from the Police Chief and Fire Chief.",
  },
  {
    id: "tamaqua-burning", county: "Schuylkill", publisher: "Tamaqua Borough",
    chapter: "30183329", sections: ["30183292", "30183302", "30183327"],
    digest: "2ea383666f846c0dafc5442d88e87e8029d44f854519fdd56831968e0a4890ca",
    label: "Burn permit required for covered vegetation and outdoor fireplaces",
    note: "Tamaqua Code §§ 116-4, 116-6 and 116-11 require a one-time permit for covered vegetation burning and a permit for outdoor fireplaces. Qualifying outdoor campfires are exempt from the permit requirement.",
  },
  {
    id: "selinsgrove-burning", county: "Snyder", publisher: "Selinsgrove Borough",
    chapter: "44137497", sections: ["44137513", "44137514"],
    digest: "4f800525e4f3f6cb529ad21701e8709054a8832186eafb914b10b1ef1d6d21d9",
    label: "Outdoor burning limited by borough ordinance",
    note: "Selinsgrove Code §§ 10-104 and 10-105 generally prohibit outdoor burning and list exceptions for activities such as qualifying cooking, recreational and ceremonial fires.",
  },
  {
    id: "wellsboro-burning", county: "Tioga", publisher: "Wellsboro Borough",
    chapter: "32634334", sections: ["32634315"],
    digest: "113c8fbd28d3251193149e37aa7a2f83857aed307b11c28d7857d7b9202d842a",
    label: "Open burning limited by borough ordinance",
    note: "Wellsboro Code § 10-405 prohibits open burning of yard waste, refuse and specified materials. It lists exceptions, including qualifying cooking, recreational and ceremonial fires.",
  },
  {
    id: "warren-city-burning", county: "Warren", publisher: "City of Warren",
    chapter: "16100836", sections: ["16100821", "16100822"],
    digest: "fc71f588a885b138e18db4983c96052a0118beb1b8423cc55366adacc5a8c8bd",
    label: "Open burning prohibited and bonfires require a permit",
    note: "Warren Code §§ 175-6 and 175-7 prohibit covered open burning, including refuse disposal. Qualifying recreational fires and outdoor fireplaces have separate rules, and bonfires require a city permit.",
  },
  {
    id: "chambersburg-burning", county: "Franklin", publisher: "Chambersburg Borough",
    chapter: "10693403", sections: ["10693394"],
    digest: "42b85463aadfc8aae69fb93b45f6dfc851e40ea32292b95eaf6cbd21808a9c25",
    label: "Open burning and recreational fires prohibited",
    note: "Chambersburg Code § 150-5 adopts local Fire Code § 307, which prohibits open burning and recreational fires. Compliant portable outdoor fireplaces follow separate rules and cannot be used for refuse, recyclables or leaf waste.",
  },
  {
    id: "duncannon-burning", county: "Perry", publisher: "Duncannon Borough",
    chapter: "13964629", sections: ["13964637"],
    digest: "c1748e2a8ac189009e3820942e0832d97548bfa2c2e3a01ddbef7502df04cf5c",
    label: "Police notification required for covered yard-waste burns",
    note: "Duncannon Code § 94-3 limits open burning to listed activities. It requires notice to borough police before covered yard-waste burns and prohibits covered outdoor burning between sunset and sunrise, except fires solely for cooking.",
  },
  {
    id: "kelly-township-burning", county: "Union", publisher: "Kelly Township",
    chapter: "44776582", sections: ["44776592"],
    digest: "f287d05987642e16b8d33722bfee842c548660ea2739122594923c5490723600",
    label: "Open fires limited by township ordinance",
    note: "Kelly Township Code § 7-105 restricts open burning to listed activities. It has specified hours for eligible household materials, requires written permission for certain other fires and separately regulates recreational and ceremonial fires.",
  },
  {
    id: "milford-borough-burning", county: "Pike", publisher: "Milford Borough",
    chapter: "32395021", sections: ["47183351", "47183352"],
    digest: "de047a232b116dd6382634894499ed001718f0de439bb16a87938c53bfd6b026",
    label: "Leaf and garbage burning prohibited",
    note: "Milford Code Chapter 115 prohibits burning leaves and garbage. It restricts covered fires on public and private property, permits limited temporary exceptions and exempts qualifying food preparation.",
  },
  {
    id: "bradford-city-burn-permit", county: "McKean", publisher: "City of Bradford",
    chapter: "49551437", sections: ["49551418", "49551423"],
    digest: "274ce521a126fd2a8e52eea8b2f56f108f00c3f6fae83441899725f5f830a1f7",
    label: "Permit required for covered open burning",
    note: "Bradford has adopted the 2018 International Fire Code with local amendments under Code Chapter 111. The city's Fire Department accepts open-burn permit applications. Confirm the requirements for your fire with the department.",
  },
];
