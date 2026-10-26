const T = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra })
const A = (key, label, extra = {}) => ({ key, label, type: 'textarea', ...extra })
const N = (key, label, extra = {}) => ({ key, label, type: 'number', ...extra })
const S = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra })
const B = (key, label, extra = {}) => ({ key, label, type: 'bool', ...extra })

export const ENTITIES = {
  npcs: {
    table: 'npcs', title: 'NPCs', singular: 'NPC', eyebrow: 'Allies, enemies, factions',
    titleOf: (r) => r.name, subtitleOf: (r) => r.role, blurbOf: (r) => r.personality,
    filter: 'status', badges: ['status', 'faction'], portrait: true,
    chips: 'status', chipOrder: ['Active', 'Future', 'Missing', 'Dead'], groupOf: (r) => r.faction || 'No faction',
    sortOf: (a, b) => (a.name || '').localeCompare(b.name || ''),
    dotOf: (r) => ({ Active: { tone: 'green', label: 'Active' }, Dead: { tone: 'red', label: 'Dead' }, Missing: { tone: 'amber', label: 'Missing' }, Future: { tone: 'grey', label: 'Not yet met' } })[r.status],
    share: { type: 'npc', subtitle: 'role', body: 'personality', meta: ['faction', 'status', 'current_location'] },
    fields: [
      T('name', 'Name', { required: true }), T('role', 'Role'), T('faction', 'Faction'),
      S('status', 'Status', ['Active', 'Future', 'Missing', 'Dead']), T('current_location', 'Current location'), N('target_session', 'Target session'),
      A('personality', 'Personality'), A('relationship', 'Relationship to party'), A('next_beat', 'Next beat'),
      A('secret', 'Secret', { dm: true }), A('notes', 'Notes'),
    ],
  },
  characters: {
    table: 'characters', title: 'Characters', singular: 'character', eyebrow: 'The party',
    titleOf: (r) => r.name, subtitleOf: (r) => [r.race, r.class_name].filter(Boolean).join(' '), blurbOf: (r) => r.arc,
    badges: ['player'], portrait: true,
    fields: [
      T('name', 'Name', { required: true }), T('player', 'Player'), T('race', 'Race'), T('class_name', 'Class'), N('ac', 'Armour class'), T('origin', 'Origin'),
      T('arc', 'Arc', { full: true }), A('core_question', 'Core question'), A('background', 'Background'), A('faith', 'Faith'),
      A('before_call', 'Before the call'), A('training', 'Training'), A('war_experience', 'War experience'), A('reputation', 'Reputation'),
      A('rumours', 'Rumours'), A('fears', 'Fears'), A('hopes', 'Hopes'), A('regret', 'Regret'), A('goals', 'Goals'),
      A('hero_moment', 'Hero moment'), A('campaign_motivation', 'Campaign motivation'),
      A('secret_detail', 'Secret detail', { dm: true }), A('dm_prompts', 'DM prompts', { dm: true }), A('notes', 'Notes'),
    ],
  },
  locations: {
    table: 'locations', title: 'Locations', singular: 'location', eyebrow: 'Mapped and discovered',
    titleOf: (r) => r.name, subtitleOf: (r) => [r.place_type, r.region, r.area].filter(Boolean).join(' · '), blurbOf: (r) => r.description,
    filter: 'region', badges: ['area', 'campaign_status'],
    chips: 'area', groupOf: (r, area) => (area ? r.region : r.area) || 'Unsorted', lineOf: (r) => [r.place_type, r.region].filter(Boolean).join(' · '),
    sortOf: (a, b) => (a.name || '').localeCompare(b.name || ''),
    share: { type: 'location', subtitle: 'place_type', body: 'description', meta: ['area', 'region', 'parent_location'] },
    fields: [
      T('name', 'Name', { required: true }), T('place_type', 'Type'), T('area', 'Area', { list: 'loc-areas', placeholder: 'Broad grouping, such as The North' }), T('region', 'Region'), T('parent_location', 'Within'),
      T('map_name', 'Map'), T('campaign_status', 'Campaign status'), T('current_state', 'Current state', { full: true }),
      A('description', 'Description'), A('state_notes', 'State notes'), A('notes', 'Notes', { dm: true }),
    ],
  },
  items: {
    table: 'items', title: 'Items', singular: 'item', eyebrow: 'Gear, relics, treasures',
    titleOf: (r) => r.name, subtitleOf: (r) => r.owner, blurbOf: (r) => r.player_knows,
    filter: 'status', badges: ['status'], chips: 'status', sortOf: (a, b) => (a.name || '').localeCompare(b.name || ''),
    share: { type: 'item', subtitle: 'owner', body: 'player_knows', meta: ['status'] },
    fields: [
      T('name', 'Name', { required: true }), T('owner', 'Owner'), T('source', 'Source'), S('status', 'Status', ['Owned', 'Found', 'Missing', 'Lost', 'Destroyed']),
      A('player_knows', 'What the players know'), A('dm_secret', 'DM secret', { dm: true }), A('notes', 'Notes'),
    ],
  },
  threads: {
    table: 'threads', title: 'Story Threads', singular: 'thread', eyebrow: 'Plots in motion',
    titleOf: (r) => r.title, subtitleOf: (r) => r.category, blurbOf: (r) => r.summary,
    filter: 'status', badges: ['status', 'category'],
    fields: [
      T('title', 'Title', { required: true }), T('category', 'Category', { list: 'thread-cats' }), S('status', 'Status', ['Active', 'Planned', 'Dormant', 'Resolved']), N('target_session', 'Target session'),
      A('summary', 'Summary'), A('next_beat', 'Next beat'), A('notes', 'Notes'),
    ],
  },
  relationships: {
    table: 'relationships', title: 'Relationships', singular: 'relationship', eyebrow: 'Bonds and rivalries',
    titleOf: (r) => `${r.person_a || '?'} & ${r.person_b || '?'}`, subtitleOf: (r) => r.relation, blurbOf: (r) => r.next_beat,
    filter: 'stage', badges: ['stage'],
    fields: [
      T('person_a', 'Person A', { required: true }), T('person_b', 'Person B'), T('relation', 'Relation'), T('stage', 'Stage'), N('target_session', 'Target session'),
      A('last_development', 'Last development'), A('next_beat', 'Next beat'), A('notes', 'Notes'),
    ],
  },
  choices: {
    table: 'choices', title: 'Choices', singular: 'choice', eyebrow: 'What the party decided',
    titleOf: (r) => r.choice_text || 'Untitled choice', subtitleOf: (r) => [r.character_name, r.session_number != null && `Session ${r.session_number}`].filter(Boolean).join(' · '), blurbOf: (r) => r.consequence,
    filter: 'status', badges: ['status'],
    fields: [
      T('character_name', 'Character'), N('session_number', 'Session'), A('choice_text', 'Choice'), A('consequence', 'Consequence'),
      S('status', 'Status', ['Pending', 'Triggered', 'Resolved']), N('target_session', 'Pays off in session'), A('notes', 'Notes'),
    ],
  },
  consequences: {
    table: 'consequences', title: 'Consequences', singular: 'consequence', eyebrow: 'Debts coming due',
    titleOf: (r) => r.title || 'Untitled', subtitleOf: (r) => [r.source_session != null && `From session ${r.source_session}`, r.target_session != null && `lands ${r.target_session}`].filter(Boolean).join(' → '), blurbOf: (r) => r.detail,
    filter: 'status', badges: ['status'],
    fields: [
      T('title', 'Title', { required: true }), S('status', 'Status', ['Pending', 'Triggered', 'Resolved']), N('source_session', 'Source session'), N('target_session', 'Target session'),
      T('linked_character', 'Linked character'), T('linked_npc', 'Linked NPC'), A('detail', 'Detail'), A('notes', 'Notes'),
    ],
  },
  secrets: {
    table: 'secrets', title: 'Secrets', singular: 'secret', eyebrow: 'Truths kept behind the screen',
    titleOf: (r) => r.title || 'Untitled', subtitleOf: (r) => r.category, blurbOf: (r) => r.known_by && `Known by ${r.known_by}`,
    filter: 'status', badges: ['status'],
    fields: [
      T('title', 'Title', { required: true }), T('category', 'Category'), S('status', 'Status', ['Hidden', 'Hinted', 'Revealed']), N('reveal_session', 'Reveal session'),
      A('truth', 'The truth', { dm: true }), T('known_by', 'Known by'), T('suspected_by', 'Suspected by'), A('notes', 'Notes'),
    ],
  },
  lore_entries: {
    table: 'lore_entries', title: 'Lore Book', singular: 'lore entry', eyebrow: 'People, places, events',
    titleOf: (r) => r.title, subtitleOf: (r) => r.subtitle || r.category, blurbOf: (r) => r.teaser,
    filter: 'category', badges: ['category', (r) => (r.revealed ? ['Revealed', 'green'] : ['Hidden', 'red'])],
    fields: [
      T('title', 'Title', { required: true }), T('slug', 'Slug', { required: true }), T('category', 'Category'), T('subtitle', 'Subtitle'),
      B('revealed', 'Visible to players'), N('sort_order', 'Sort order'), A('teaser', 'Teaser'), A('body', 'Body'), T('source_label', 'Source', { full: true }),
    ],
  },
  campaign_overview: {
    table: 'campaign_overview', title: 'Campaign Overview', singular: 'entry', eyebrow: 'The long road',
    titleOf: (r) => r.title, subtitleOf: (r) => [r.kind, r.session_range].filter(Boolean).join(' · '), blurbOf: (r) => r.summary,
    filter: 'kind', badges: ['status'],
    fields: [
      T('title', 'Title', { required: true }), S('kind', 'Kind', ['Campaign', 'Phase', 'Thread', 'Session']), T('status', 'Status'), T('session_range', 'Session range'),
      N('session_start', 'First session'), N('session_end', 'Last session'), N('position', 'Order'), A('summary', 'Summary'), A('details', 'Details'),
    ],
  },
  party_inventory: {
    table: 'party_inventory', title: 'Party Inventory', singular: 'item', eyebrow: 'Shared stores',
    titleOf: (r) => `${r.name || 'Item'}${r.quantity > 1 ? ` ×${r.quantity}` : ''}`, subtitleOf: (r) => r.holder, blurbOf: (r) => r.notes,
    badges: ['status'],
    fields: [T('name', 'Name', { required: true }), N('quantity', 'Quantity'), T('holder', 'Holder'), T('source', 'Source'), T('status', 'Status'), A('notes', 'Notes')],
  },
  maps: {
    table: 'maps', title: 'Maps', singular: 'map', eyebrow: 'Charts and handouts',
    titleOf: (r) => r.name, subtitleOf: (r) => r.linked_location, blurbOf: (r) => r.description,
    fields: [T('name', 'Name', { required: true }), T('file_path', 'File'), T('linked_location', 'Linked location'), A('description', 'Description')],
  },
  music: {
    table: 'music', title: 'Music', singular: 'track', eyebrow: 'Scene audio',
    titleOf: (r) => r.title || 'Untitled track', subtitleOf: (r) => [r.category, r.mood].filter(Boolean).join(' · '), blurbOf: (r) => r.linked_scene,
    filter: 'category', badges: ['mood'],
    fields: [T('title', 'Title', { required: true }), T('url', 'Link'), T('category', 'Category'), T('mood', 'Mood'), N('linked_session', 'Session'), T('linked_scene', 'Scene'), T('linked_location', 'Location'), A('notes', 'Notes')],
  },
  quick_notes: {
    table: 'quick_notes', title: 'Quick Notes', singular: 'note', eyebrow: 'Scratch pad',
    titleOf: (r) => (r.note || '').split('\n')[0].slice(0, 80) || 'Note', subtitleOf: (r) => r.status, blurbOf: (r) => r.note,
    filter: 'status', badges: ['status'],
    fields: [A('note', 'Note'), S('status', 'Status', ['Open', 'Done'])],
  },
}

export const BLOCK_TYPES = {
  'Read Aloud': '#d9c59c', Narration: '#c9a15e', Dialogue: '#8fb3d9', 'DM Note': '#c9382c', Scene: '#c9a15e', Encounter: '#c9382c',
  NPC: '#b58ad6', Check: '#6fb06a', Checks: '#6fb06a', Clue: '#e2c07f', Choice: '#e08a4f', 'Story Beat': '#d6a36a', 'Character Arc': '#b58ad6',
  Overview: '#8a6d43', Reference: '#7a6a58', Section: '#8a6d43', Item: '#e2c07f', Travel: '#6f9fa8', Puzzle: '#6fb06a',
}
