import { DocumentQuery, Document, Model, Error } from "mongoose";
import { ObjectId } from "mongodb";
import { injectable, unmanaged } from "inversify";
import { Decoder } from "@mojotech/json-type-validation";
import httpErrors from "http-errors";

/**
 * @swagger
 *
 * definitions:
 *   PaginateOptions:
 *     type: object
 *     properties:
 *       pageIndex:
 *         type: number
 *         description: 0-based page number
 *       pageSize:
 *         type: number
 *       sort:
 *         type: object
 *         description: Sort object following the Mongoose notation
 *       populate:
 *         type: string
 *         description: Fields to populate separated by spaces
 *       select:
 *         type: string
 *         description: Fields to select separated by spaces
 */
export interface QueryOptions {
    populate?: string
    select?: string,
}
export interface PaginateOptions extends QueryOptions {
    pageIndex?: number
    pageSize?: number
    sort?: Object
}

/**
 * @swagger
 *
 * definitions:
 *   Paginated:
 *     type: object
 *     properties:
 *       meta:
 *         type: object
 *         properties:
 *           total:
 *             type: number
 *             description: Total number of documents present (estimated)
 *           pages:
 *             type: number
 *             description: Total number of pages (estimated by total)
 *       docs:
 *         type: array
 *         description: Documents on this page
 *         items:
 *           type: object
 */
export interface Paginated<T extends Document> {
    meta: {
        total: number
        pages: number
    }
    docs: T[]
}

/**
 * @swagger
 *
 * definitions:
 *   QueryModel:
 *     type: object
 *     properties:
 *       pagination:
 *         type: object
 *         schema:
 *           $ref: "#/definitions/PaginateOptions"
 *       query:
 *         type: object
 *         description: Query object following the Mongoose query notation
 */
export type MongoQuery<T> = Partial<T> | Object;

@injectable()
export class MongoRepository<DTO, Doc extends Document> {

    constructor(
        @unmanaged() private model: Model<Doc>,
        @unmanaged() private decoder: Decoder<DTO>,
        @unmanaged() private searchFields: string[] = []
    ) {}

    public async save(object: DTO): Promise<Doc> {
        try {
            return await this.model.create(object);
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    private queryMany(query: MongoQuery<DTO & Doc>, pagination?: PaginateOptions): DocumentQuery<Doc[], Doc> {
        return !pagination ?
            this.model.find(query) : // No pagination
            this.model.find(query)   // With pagination
                .skip(pagination.pageIndex * pagination.pageSize)
                .limit(pagination.pageSize)
                .sort(pagination.sort || {})
                .populate(pagination.populate || "")
                .select(pagination.select || "");
    }

    public async findById(id: string, options: QueryOptions = {}): Promise<Doc> {
        this.checkValidObjectId(id);
        try {
            return await this.model.findById(id).populate(options.populate || "").select(options.select || "").orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public async find(query: MongoQuery<DTO & Doc>, options: QueryOptions = {}): Promise<Doc[]> {
        try {
            return await this.queryMany(query).populate(options.populate || "").select(options.select || "").orFail().exec();
        } catch (err) {
            if (err.name === "DocumentNotFoundError") {
                return []; // Instead of DocumentNotFoundError
            }
            throw this.formatMongoError(err);
        }
    }

    public async paginate(query: MongoQuery<DTO & Doc>, pagination: PaginateOptions): Promise<Paginated<Doc>> {
        const docsCount = await this.model.find(query).countDocuments().exec();
        let docs: Doc[] = [];
        try {
            docs = await this.queryMany(query || {}, pagination).orFail().exec();
        } catch (err) {
            if (err.name !== "DocumentNotFoundError") {
                throw this.formatMongoError(err);
            }
        }

        return {
            meta: {
                total: docsCount,
                pages: Math.ceil(docsCount / pagination.pageSize)
            },
            docs: docs
        };
    }

    public async searchByText(text: string, pagination: PaginateOptions): Promise<Paginated<Doc>> {
        if (this.searchFields.length === 0) {
            return { meta: { total: 0, pages: 0 }, docs: [] };
        }
        const or = this.searchFields.map(field => {
            return {
                [field]: {
                    $regex: text,
                    $options: "i"
                }
            }
        });
        const query = { $or: or };
        return this.paginate(query, pagination);
    }

    public async findOne(query: MongoQuery<DTO & Doc>, options: QueryOptions = {}): Promise<Doc> {
        try {
            return await this.model.findOne(query || {}).populate(options.populate || "").select(options.select || "").orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public async updateById(id: string, updateBody: (Partial<DTO> | any), upsert: boolean = false): Promise<Doc> {
        this.checkValidObjectId(id);
        try {
            return await this.model.findByIdAndUpdate(id, updateBody, {
                new: true,
                runValidators: true,
                upsert: upsert,
                setDefaultsOnInsert: true,
                context: "query"
            }).orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public async updateOne(query: MongoQuery<DTO & Doc>, updateBody: (Partial<DTO> | any), upsert: boolean = false): Promise<Doc> {
        try {
            return await this.model.findOneAndUpdate(query, updateBody, {
                new: true,
                runValidators: true,
                upsert: upsert,
                setDefaultsOnInsert: true,
                context: "query"
            }).orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public async deleteById(id: string): Promise<Doc> {
        this.checkValidObjectId(id);
        try {
            return await this.model.findByIdAndDelete(id).orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public countDocuments(query?: MongoQuery<DTO & Doc>): Promise<number> {
        try {
            return this.model.countDocuments(query || {}).orFail().exec();
        } catch (err) {
            throw this.formatMongoError(err);
        }
    }

    public checkValidObjectId(id: string | number | ObjectId) {
        if (!ObjectId.isValid(id)) {
            throw new httpErrors.BadRequest("Malformed object id!");
        }
    }

    public paginateOptionsFromObject(object: any): PaginateOptions {
        if (!object) object = {};
        return {
            pageIndex: parseInt(object["pageIndex"] || "0"),
            pageSize: parseInt(object["pageSize"] || "10"),
            sort: JSON.parse(object["sort"] || "{}"),
            populate: object["populate"] || "",
            select: object["select"] || "",
        };
    }

    public validateObject(object: Object) {
        try {
            this.decoder.runWithException(object);
        } catch (err) {
            throw new httpErrors.BadRequest(err);
        }
    }

    protected formatMongoError(error: Error) {
        // I'm not using a switch statement because the linter is convinced that error.name can ONLY be "MongooseError"
        if (error.name === "ValidationError") {
            throw this.formatValidationError(error as Error.ValidationError);
        }
        if (error.name === "DocumentNotFoundError") {
            throw this.formatDocumentNotFoundError(error as Error.DocumentNotFoundError);
        }

        throw new httpErrors.InternalServerError(`${error.name}: ${error.message}`);
    }

    private formatValidationError(baseError: Error.ValidationError) {
        return (Object.keys(baseError.errors).every(error => baseError.errors[error].kind === "unique"))
            ? new httpErrors.Conflict(`Expected these parameters to be unique: ${Object.keys(baseError.errors).join(", ")}`)
            : new httpErrors.BadRequest(Object.keys(baseError.errors).map(error => baseError.errors[error].message).join(" "));
    }

    private formatDocumentNotFoundError(baseError: Error.DocumentNotFoundError) {
        return new httpErrors.NotFound(baseError.message);
    }

}
