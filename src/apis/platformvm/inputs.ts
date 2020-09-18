/**
 * @packageDocumentation
 * @module API-PlatformVM-Inputs
 */
import { Buffer } from 'buffer/';
import BinTools from '../../utils/bintools';
import { PlatformVMConstants } from './constants';
import { Input, StandardTransferableInput, StandardAmountInput, StandardParseableInput } from '../../common/input';
import { Serialization, SerializedEncoding } from '../../utils/serialization';
import BN from 'bn.js';

/**
 * @ignore
 */
const bintools = BinTools.getInstance();
const serializer = Serialization.getInstance();

/**
 * Takes a buffer representing the output and returns the proper [[Input]] instance.
 *
 * @param inputid A number representing the inputID parsed prior to the bytes passed in
 *
 * @returns An instance of an [[Input]]-extended class.
 */
export const SelectInputClass = (inputid:number, ...args:Array<any>):Input => {
  if (inputid === PlatformVMConstants.SECPINPUTID) {
    return new SECPTransferInput(...args);
  } else if (inputid === PlatformVMConstants.STAKEABLELOCKINID) {
    return new StakeableLockIn(...args);
  }
  /* istanbul ignore next */
  throw new Error(`Error - SelectInputClass: unknown inputid ${inputid}`);
};

export class ParseableInput extends StandardParseableInput{
  protected _typeName = "ParseableInput";
  protected _typeID = undefined;

  //serialize is inherited

  deserialize(fields:object, encoding:SerializedEncoding = "hex") {
    super.deserialize(fields, encoding);
    this.input = SelectInputClass(fields["input"]["_typeID"]);
    this.input.deserialize(fields["input"], encoding);
  }

  fromBuffer(bytes:Buffer, offset:number = 0):number {
    const inputid:number = bintools.copyFrom(bytes, offset, offset + 4).readUInt32BE(0);
    offset += 4;
    this.input = SelectInputClass(inputid);
    return this.input.fromBuffer(bytes, offset);
  }
}

export class TransferableInput extends StandardTransferableInput {
  protected _typeName = "TransferableInput";
  protected _typeID = undefined;

  //serialize is inherited

  deserialize(fields:object, encoding:SerializedEncoding = "hex") {
    super.deserialize(fields, encoding);
    this.input = SelectInputClass(fields["input"]["_typeID"]);
    this.input.deserialize(fields["input"], encoding);
  }

  /**
   * Takes a {@link https://github.com/feross/buffer|Buffer} containing a [[TransferableInput]], parses it, populates the class, and returns the length of the [[TransferableInput]] in bytes.
   *
   * @param bytes A {@link https://github.com/feross/buffer|Buffer} containing a raw [[TransferableInput]]
   *
   * @returns The length of the raw [[TransferableInput]]
   */
  fromBuffer(bytes:Buffer, offset:number = 0):number {
    this.txid = bintools.copyFrom(bytes, offset, offset + 32);
    offset += 32;
    this.outputidx = bintools.copyFrom(bytes, offset, offset + 4);
    offset += 4;
    this.assetid = bintools.copyFrom(bytes, offset, offset + PlatformVMConstants.ASSETIDLEN);
    offset += 32;
    const inputid:number = bintools.copyFrom(bytes, offset, offset + 4).readUInt32BE(0);
    offset += 4;
    this.input = SelectInputClass(inputid);
    return this.input.fromBuffer(bytes, offset);
  }

}

export abstract class AmountInput extends StandardAmountInput {
  protected _typeName = "AmountInput";
  protected _typeID = undefined;

  //serialize and deserialize both are inherited

  select(id:number, ...args: any[]):Input {
    return SelectInputClass(id, ...args);
  }
}

export class SECPTransferInput extends AmountInput {
  protected _typeName = "SECPTransferInput";
  protected _typeID = PlatformVMConstants.SECPINPUTID;

  //serialize and deserialize both are inherited

  /**
   * Returns the inputID for this input
   */
  getInputID():number {
    return this._typeID;
  }

  getCredentialID = ():number => PlatformVMConstants.SECPCREDENTIAL;

  create(...args:any[]):this{
    return new SECPTransferInput(...args) as this;
  }

  clone():this {
    const newout:SECPTransferInput = this.create()
    newout.fromBuffer(this.toBuffer());
    return newout as this;
  }

}

/**
 * An [[Input]] class which specifies an input that has a locktime which can also enable staking of the value held, preventing transfers but not validation.
 */
export class StakeableLockIn extends AmountInput {
  protected _typeName = "StakeableLockIn";
  protected _typeID = PlatformVMConstants.STAKEABLELOCKINID;

  //serialize and deserialize both are inherited

  serialize(encoding:SerializedEncoding = "hex"):object {
    let fields:object = super.serialize(encoding);
    let outobj:object = {
      ...fields,
      "stakeableLocktime": serializer.encoder(this.stakeableLocktime, encoding, "Buffer", "decimalString", 8),
      "transferableInput": this.transferableInput.serialize(encoding)
    };
    delete outobj["sigIdxs"];
    delete outobj["sigCount"];
    delete outobj["amount"];
    return outobj;
  };
  deserialize(fields:object, encoding:SerializedEncoding = "hex") {
    fields["sigIdxs"] = [];
    fields["sigCount"] = "0";
    fields["amount"] = "98";
    super.deserialize(fields, encoding);
    this.stakeableLocktime = serializer.decoder(fields["stakeableLocktime"], encoding, "decimalString", "Buffer", 8);
    this.transferableInput.deserialize(fields["transferableInput"], encoding);
    this.synchronize();
  }

  protected stakeableLocktime:Buffer;
  protected transferableInput:ParseableInput;

  private synchronize(){
    let input:AmountInput = this.transferableInput.getInput() as AmountInput;
    this.sigIdxs = input.getSigIdxs();
    this.sigCount = Buffer.alloc(4);
    this.sigCount.writeUInt32BE(this.sigIdxs.length, 4);
    this.amount = bintools.fromBNToBuffer(input.getAmount(), 8);
    this.amountValue = input.getAmount();
  }

  getStakeableLocktime():BN {
    return bintools.fromBufferToBN(this.stakeableLocktime);
  }

  getTransferableOutput():ParseableInput {
    return this.transferableInput;
  }
  /**
   * Returns the inputID for this input
   */
  getInputID():number {
    return this._typeID;
  }

  getCredentialID = ():number => PlatformVMConstants.SECPCREDENTIAL;

  /**
   * Popuates the instance from a {@link https://github.com/feross/buffer|Buffer} representing the [[StakeableLockIn]] and returns the size of the output.
   */
  fromBuffer(inbuff:Buffer, offset:number = 0):number {
    this.stakeableLocktime = bintools.copyFrom(inbuff, offset, offset + 8);
    offset += 8;
    return super.fromBuffer(inbuff, offset);
  }

  /**
   * Returns the buffer representing the [[StakeableLockIn]] instance.
   */
  toBuffer():Buffer {
    const superbuff:Buffer = super.toBuffer();
    const bsize:number = this.stakeableLocktime.length + superbuff.length;
    const barr:Array<Buffer> = [this.stakeableLocktime, superbuff];
    return Buffer.concat(barr, bsize);
  }
  
  create(...args:any[]):this{
    return new StakeableLockIn(...args) as this;
  }

  clone():this {
    const newout:StakeableLockIn = this.create()
    newout.fromBuffer(this.toBuffer());
    return newout as this;
  }

  select(id:number, ...args: any[]):Input {
    return SelectInputClass(id, ...args);
  }

  /**
   * A [[Output]] class which specifies an [[Input]] that has a locktime which can also enable staking of the value held, preventing transfers but not validation.
   *
   * @param amount A {@link https://github.com/indutny/bn.js/|BN} representing the amount in the input
   * @param stakeableLocktime A {@link https://github.com/indutny/bn.js/|BN} representing the stakeable locktime
   * @param transferableInput A [[ParseableInput]] which is embedded into this input.
   */
  constructor(amount:BN = undefined, stakeableLocktime:BN = undefined, transferableInput:ParseableInput = undefined) {
    super(amount);
    if (typeof stakeableLocktime !== "undefined") {
      this.stakeableLocktime = bintools.fromBNToBuffer(stakeableLocktime, 8);
    }
    if (typeof transferableInput !== "undefined") {
      this.transferableInput = transferableInput;
      this.synchronize();
    }
  }
}
