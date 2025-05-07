import { App, Notice, TFile, TFolder} from 'obsidian';


interface FIFO_TTL_item<V> {
	value: V;
	expiration: number;
}
/** FIFO with key-value items and expiring mechanism. Use like a regular Map() object.*/
export class FIFO_TTL <K,V>{
	private readonly cache = new Map<K,FIFO_TTL_item<V>>();

	constructor(private readonly maxSize: number, private readonly  max_ttl_ms: number) {}
	public set(key: K, value: V) {
		const exp = Date.now() + this.max_ttl_ms;
		this.cache.delete(key);
		this.cache.set(key, { value, exp });
		if (this.maxSize < this.cache.size ) {
			this.cache.delete( this.cache.keys().next().value ); // Map object use FIFO under the hood.
		}
	}

	public get(key: K): V | undefined { return this._get(key)?.value; }
	public get size(): number { return this.cache.size; }
	public get isEmpty(): boolean { return this.cache.size === 0; }
	public has(key: K): boolean { return !!this._get(key); }
	public delete(key: K): boolean { return this.cache.delete(key); }
	public clear() { this.cache.clear(); }

	private _get(key: K): FIFO_TTL_item<V> | undefined {
		const item = this.cache.get(key);
		const isExpired = item && item.expiration ? (Date.now() >= item.expiration) : false;
		if (!item || isExpired) {
			this.cache.delete(key);
			return undefined;
		}
		return item;
	}
}

/** Abstract class for ETL Module. */
export class AbstractETL {
	private app: App;
	private settings: BirSettings;
	private static idCache: FIFO_TTL<string, Object>;
	private static searchCache: FIFO_TTL<string, Object>;

	constructor(app: App, settings: BirSettings) {
		this.app = app;
		this.settings = settings;

		// FIFO queue for 50 records and TTL = 2 hours
		this.idCache = new FIFO_TTL<string, Object>(50, 1000 * 60 * 60 * 2 );
		// 10 minutes for search requests
		this.searchCache = new FIFO_TTL<string, Object>(50, 1000 * 60 * 10 );
	}

	async searchCompany(searchTxt: string): Promise<Array<Object>> {
		const cached = this.searchCache.get(searchTxt);
		if (cached)
			return Promise.resolve(cached);
		if (!searchTxt.length || 2>searchTxt.length ) {
			new Notice("Укажите как минимум три символа для поиска организации!", 4000)
			return [];
		}

		const ret = await this._searchCompany(searchTxt);
		this.searchCache.set(searchTxt, ret);
		return ret;
	}

	/** Note: Company without 'ОКОПФ' record is treated as HQ (not a branch, etc.) */
	isCompanyBranch(compData: Object): boolean {
		const branchOKOPF = ['30001', '30002', '30003', '30004'];
		return compData['ОКОПФ'] && branchOKOPF.some( (i)=> compData['ОКОПФ'].startsWith(i)) ? true : false;
	}

	async getCompanyDataByID(in_ID: string): Promise<Object> {
		const cached = this.idCache.get(in_ID);
		if (cached)
			return Promise.resolve(cached);

		const ret = await this._getCompanyDataByID(in_ID);
		this.idCache.set(in_ID, ret);
		return ret;
	}

	// Override this
	private async _getCompanyDataByID(birID: string): Promise<Object> {
	}

	// Override this
	private async _searchCompany(searchTxt: string): Promise<Array<Object>> {
	}

	// Override this
	async getHQforTaxID(taxID: string): Promise<Object> {
	}

	// Override this
	async getlinkedPersonsViaTaxID(taxID: string): Array {
	}
}
