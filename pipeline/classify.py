"""Rule-based relevance filtering, topic tagging and format detection.

Everything here is a pure function of (title, description, source config), so the
whole catalog is re-classified on every run and rule changes apply retroactively.
"""
import re

I = re.IGNORECASE


def rx(pattern, flags=I):
    return re.compile(pattern, flags)


# --- Relevance -----------------------------------------------------------------

AI_CORE = rx(
    r"(?-i:\bAI\b|\bA\.I\.|\bAGI\b|\bASI\b|\bML\b|\bNLP\b|\bRL\b|\bLLMs?\b|\bVLMs?\b|\bGPT)"
    r"|artificial intelligence|machine learning|deep learning|neural net|language models?"
    r"|large language|transformers?\b|foundation models?|generative models?|diffusion models?"
    r"|reinforcement learning|computer vision|natural language|chatgpt|chatbot|\bclaude\b|gemini\b"
    r"|alignment|interpretab|explainab|mechanistic|superintelligen|ai[- ]safety|frontier models?"
    r"|in-context learning|chain[- ]of[- ]thought|reasoning models?|representation learning"
    r"|self-supervised|supervised learning|unsupervised|learning theory|statistical learning"
    r"|neural networks?|backprop|gradient descent|embeddings?\b|autoencoder|robot learning"
    r"|agents?\b.*\b(llm|language|ai)|(llm|language|ai)\b.*\bagents?\b|agentic|sparse autoencoder"
    r"|jailbreak|prompt injection|red[- ]teaming|deepfake|automated reasoning|learning-augmented"
    r"|intelligence explosion|transformative ai|ai timelines|artificial (sentience|minds?|agents?|general)"
    r"|digital minds|(?-i:\bDNNs?\b|\bCNNs?\b|\bGANs?\b|\bVAEs?\b)|generative|normalizing flows?"
    r"|flow matching|variational inference|multimodal|vision[- ]language|graph neural|recommender systems?"
    r"|algorithmic (audit|fairness|bias|accountab|decision|transparen)|automated decision|speech recognition"
    r"|machine translation|scaling laws?|deep (nets|networks)|model (evaluation|evals)|machine intelligence"
)

SECURITY = rx(
    r"secur|privacy|\bprivate\b|attacks?\b|adversarial|vulnerab|exploit|malware|ransomware|phishing"
    r"|fuzzing|fuzzer|side[- ]channel|spectre|meltdown|rowhammer|intrusion|threats?\b|forensic|authenticat"
    r"|password|tracking|surveillance|censorship|\btor\b|anonymi|backdoor|poisoning|jailbreak"
    r"|prompt injection|membership inference|model (stealing|extraction)|watermark|deepfake|cyber"
    r"|hacking|hackers?\b|bug bount|zero[- ]day|\b0-?day|reverse engineering|binary analysis"
    r"|memory safety|sandbox|trusted execution|\btee\b|\bsgx\b|firmware|differential(ly)? privacy"
    r"|federated|misinformation|disinformation|fraud|abuse|spam|botnet|ddos|supply[- ]chain"
)

CRYPTO = rx(
    r"cryptograph|\bcrypto\b(?!\s*(currenc|price|market|trading))|encrypt|zero[- ]knowledge|\bzk"
    r"|\bsnarks?\b|\bstarks?\b|lattice[- ]based|lattice (crypto|problems?|reduction)|learning with errors"
    r"|post[- ]quantum|homomorphic|\bfhe\b|multi[- ]?party computation|\bmpc\b|secret sharing|obfuscation"
    r"|digital signatures?|signature schemes?|(threshold|blind|ring|aggregate|group) signatures?|hash functions?"
    r"|\bpir\b|oblivious|(polynomial|vector) commitments?|commitment schemes?|isogen|elliptic[- ]curve crypto"
    r"|\blwe\b|quantum key|key exchange|cryptanalysis|\btls\b|pseudorandom|one-way functions?"
)

# Non-content: trailers, promos, admin, recruiting, event logistics.
JUNK = rx(
    r"#shorts|\btrailer\b|\bteaser\b|\bpromo\b|\bhighlights?\b|event recap|\bsizzle\b"
    r"|call for (papers|participation|proposals)|registration (is )?open|info(rmation)? session"
    r"|open house|admissions|commencement|graduation ceremony|career fair|we.re hiring|now hiring"
    r"|meet the (board|team)|fundrais|giveaway|unboxing|coming soon|stream (test|starting)|test stream"
    r"|livestream test|^(day \d+ )?(live|livestream)$|thank you video|channel update|subscribe"
    r"|rump session|(opening|closing|welcome|concluding) (remarks|address|session)|award ceremony"
    r"|student (story|spotlight)|day in the life|faces of|official recap|(workshop|conference|summit|event|year) recap"
    r"|recap video|\bcareers?\b|job market|land your|getting hired|planning your path|how to become"
)

# Titles that are clearly not in English (German / French / Spanish function words).
NON_ENGLISH = rx(
    r"\b(und|der|die|das|mit|für|nicht|wie|zum|zur|einer?|ist|warum|wird|auf|von|ein|im|sicherheit"
    r"|les|des|et|pour|une|du|dans|avec|sur|est|rencontrez|présentation|los|las|para|con|una|el)\b"
)

# Generic engineering / product / hustle content. Skipped for trusted academic venues.
ENGINEERING = rx(
    r"langchain|llama-?index|crewai|autogen studio|\bn8n\b|zapier|make\.com|no[- ]code|low[- ]code"
    r"|kubernetes|\bk8s\b|docker|terraform|\baws\b|\bazure\b|\bgcp\b|google cloud|vertex ai|bedrock"
    r"|sagemaker|databricks|snowflake|salesforce|copilot studio|power bi|\bexcel\b|chatgpt (tips|hacks)"
    r"|prompt(ing)? (tips|hacks|templates)|step[- ]by[- ]step guide|for beginners|\bin \d+ minutes"
    r"|full course|(build|create|make|code) (an?|your( own)?) (app|chatbot|website|saas|startup)"
    r"|deploy(ing)? (to|on|with)|api tutorial|python tutorial|javascript tutorial|react\.?js|next\.?js"
    r"|fastapi|\bflask\b|django|streamlit|gradio|vector (database|db)|pinecone|weaviate|chromadb"
    r"|\bmlops\b|devops|ci/cd|\bcursor\b|claude code|vibe[- ]?cod|productivity|side hustle|make money"
    r"|passive income|crypto(currency)? (price|trading)|\bnfts?\b|\bseo\b|marketing|sales team"
    r"|customer (story|success)|case study:|product (demo|launch|update)|webinar|sponsored"
    r"|\bmcp\b|model context protocol|pydantic|vllm|ai-native|enterprise ai"
)

# --- Topics --------------------------------------------------------------------

TOPICS = {
    "safety": rx(
        r"(ai|agi|model) safety|safety (research|case|eval|of)|alignment|misalign|x-?risk|existential"
        r"|catastroph|scalable oversight|reward hacking|specification gaming|decepti|scheming|sandbagg"
        r"|power[- ]seeking|corrigib|\bai control\b|loss of control|dangerous capabilit|frontier (ai )?risk"
        r"|red[- ]?team|model organism|sleeper agent|situational awareness|superintelligen|safe (ai|rl|agi)"
        r"|constitutional|\brlhf\b|reward model|value learning|cooperative ai|ai welfare|monitor(ing|ability)"
        r"|faithful|honest|truthful|sycophan|unlearning|oversight|\bevals?\b|capability evaluation"
    ),
    "interp": rx(
        r"interpretab|explainab|mechanistic|circuit (discovery|tracing)|neural circuits? in|sparse autoencoder"
        r"|(?-i:\bSAEs?\b)|superposition|probing|\bprobes?\b|steering|activation patching|attribution"
        r"|feature visuali|representation engineering|monosemantic|polysemantic|transcoder|crosscoder"
        r"|logit lens|saliency|\bxai\b|understanding (how|what) (llms?|models|neural)|inside (llms?|the model)"
        r"|biology of a|tracing the thoughts|world models? in"
    ),
    "llm": rx(
        r"(?-i:\bLLMs?\b|\bGPT|\bVLMs?\b|\bMoE\b|\bRAG\b)|language models?|transformers?\b|chatgpt"
        r"|foundation models?|in-context|chain[- ]of[- ]thought|reasoning|test[- ]time|inference[- ]time"
        r"|pre-?train|post-?train|fine-?tun|instruction[- ]tun|tokeniz|attention|scaling laws?"
        r"|mixture[- ]of[- ]experts|multimodal|vision[- ]language|diffusion|generative (ai|models?)"
        r"|\bagents?\b|agentic|tool[- ]use|long[- ]context|state[- ]space|mamba|hallucinat|\bclaude\b"
        r"|gemini|llama|distillation|synthetic data|benchmark"
    ),
    "theory": rx(
        r"learning theory|theory of|theoretical|generaliz|sample complexity|\bpac\b|vc[- ]dimension"
        r"|online learning|bandits?|regret|convex|optimization|gradient descent|\bsgd\b|implicit bias"
        r"|neural tangent|mean[- ]field|high[- ]dimensional|statistic|estimation|minimax|lower bounds?"
        r"|upper bounds?|complexity|provabl|theorem|\bproofs?\b|random matrix|information theory|bayesian"
        r"|causal|sampling|markov|probabilit|algorithm|learnability|approximation|kernel"
    ),
    "security": SECURITY,
    "crypto": CRYPTO,
    "policy": rx(
        r"polic(y|ies)|governance|regulat|\blaw\b|legal|legislat|ethic|fairness|\bbias|discriminat"
        r"|accountab|transparen|societ|social|democra|election|labou?r market|economic|economy|\bjobs\b"
        r"|inequality|geopolitic|china|national security|military|weapon|arms race|compute governance"
        r"|export control|ai act|standards|\baudit|liability|copyright|human rights|public interest"
        r"|forecast|timelines|transformative ai|post-agi|future of (work|ai|humanity)|power concentration"
    ),
    "rl": rx(
        r"reinforcement learning|(?-i:\bRL\b)|robot|embodied|\bcontrol\b|planning|multi[- ]agent"
        r"|game theory|self[- ]play|decision[- ]making|world models?|sim2real|locomotion|manipulation"
    ),
    "neuro": rx(
        r"neuroscien|\bbrains?\b|cognit|psycholog|conscious|perception|language acquisition"
        r"|human (learning|intelligence|mind)|\bminds?\b|neurons?\b|cortex|hippocamp|child(ren)? learn"
    ),
}

TOPIC_LABELS = {
    "safety": "Safety & Alignment",
    "interp": "Interpretability",
    "llm": "LLMs & Agents",
    "theory": "ML Theory",
    "security": "Security & Privacy",
    "crypto": "Cryptography",
    "policy": "Policy & Society",
    "rl": "RL & Robotics",
    "neuro": "Neuro & Cognition",
}

# --- Format --------------------------------------------------------------------

VENUES = (
    r"usenix|\bsec ?'\d\d|security '\d\d|\bs&p\b|\bsp ?20\d\d|\bccs\b|\bndss\b|eurocrypt|asiacrypt|\bcrypto 20"
    r"|\brwc\b|real world crypto|\bpets\b|neurips|\bicml\b|\biclr\b|\bcolm\b|\bacl\b|\bemnlp\b|\bnaacl\b"
    r"|\bcvpr\b|\biccv\b|\beccv\b|\baaai\b|\bijcai\b|\bcolt\b|\bstoc\b|\bfocs\b|\bsoda\b|satml|aistats"
    r"|\buai\b|\bkdd\b|facct|\baies\b|enigma|\bsoups\b|\bpepr\b|def ?con|black ?hat|#\w*\d\d\b"
)

FORMATS = [
    ("keynote", rx(r"keynote|invited talk|plenary|distinguished lecture|memorial lecture|turing (award )?lecture|named lecture")),
    ("panel", rx(r"\bpanel\b|\bdebate\b|roundtable|round table|fireside|in conversation|conversation with|polylogue")),
    ("tutorial", rx(r"tutorial|boot ?camp|crash course|primer\b|\bexplained\b|from scratch|let.s build|\bintro(duction)? to\b")),
    ("lecture", rx(r"\blecture\b|\blec\.? ?\d|\bcs ?\d{2,3}[a-z]?\b|\b\d\.\d{2,4}\b|\bcourse\b|\bclass \d|\bweek \d")),
    ("seminar", rx(r"seminar|colloquium|reading group|journal club|research jam|\bdlct\b")),
    ("interview", rx(r"interview|podcast|\bq&a\b|ask me anything|\bama\b|in dialogue")),
    ("conference", rx(VENUES)),
    ("workshop", rx(r"workshop|symposium|summit|conference|\bconf\b")),
]

FORMAT_LABELS = {
    "keynote": "Keynote / Invited",
    "panel": "Panel & Discussion",
    "tutorial": "Tutorial & Explainer",
    "lecture": "Lecture & Course",
    "seminar": "Seminar",
    "interview": "Interview",
    "conference": "Conference talk",
    "workshop": "Workshop & Symposium",
    "talk": "Talk",
}


def _compile_source(src):
    """Cache compiled per-source regexes on the source dict."""
    if "_inc" not in src:
        src["_inc"] = rx(src["include"]) if src.get("include") else None
        src["_exc"] = rx(src["exclude"]) if src.get("exclude") else None
    return src


def keep(item, src):
    """Return True if this item belongs in the catalog."""
    _compile_source(src)
    title = item.get("title") or ""

    if item.get("type") == "video":
        dur = item.get("dur")
        min_dur = src.get("min_duration", 240)
        if dur is not None and dur < min_dur:
            return False
        if item.get("short"):
            return False

    if JUNK.search(title):
        return False
    if len(NON_ENGLISH.findall(title)) >= 2:
        return False
    if src["_exc"] and src["_exc"].search(title):
        return False
    if not src.get("trusted") and ENGINEERING.search(title):
        return False

    included = bool(src["_inc"] and src["_inc"].search(title))
    if src.get("require_include"):
        return included
    if included:
        return True

    mode = src.get("filter", "all")
    if mode == "all":
        return True
    # For filtered (broad) channels, only the title is trusted - descriptions are
    # often boilerplate that mentions AI for every video.
    if mode == "ai":
        return bool(AI_CORE.search(title))
    if mode == "ai_sec":
        return bool(AI_CORE.search(title) or SECURITY.search(title) or CRYPTO.search(title))
    raise ValueError(f"unknown filter {mode!r} for source {src['id']}")


def topics(item, src):
    title = item.get("title") or ""
    text = f"{title}\n{(item.get('desc') or '')[:300]}"
    found = [t for t, r in TOPICS.items() if r.search(title)]
    # Descriptions are noisier; only use them for the high-precision topics.
    for t in ("interp", "crypto"):
        if t not in found and TOPICS[t].search(text):
            found.append(t)
    for t in src.get("topics", []):
        if t not in found:
            found.append(t)
    return [t for t in TOPIC_LABELS if t in found]


def fmt(item, src):
    if item.get("type") == "podcast":
        return "podcast"
    title = item.get("title") or ""
    for name, r in FORMATS:
        if r.search(title):
            return name
    return src.get("kind", "talk")
