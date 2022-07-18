import "fake-indexeddb/auto"
import sinon from "sinon"
import {
  createKeyringService,
  createLedgerService,
  createSigningService,
} from "../../../tests/factories"
import SigningService from "../index"

describe.skip("Signing Service Unit", () => {
  let signingService: SigningService
  const sandbox = sinon.createSandbox()

  beforeEach(async () => {
    signingService = await createSigningService()
    await signingService.startService()
    sandbox.restore()
  })

  afterEach(async () => {
    await signingService.stopService()
  })

  describe("deriveAddress", () => {
    it("should use ledger service to derive from a ledger account", async () => {
      const ledgerService = await createLedgerService()
      await ledgerService.startService()
      const deriveAddressStub = sandbox
        .stub(ledgerService, "deriveAddress")
        .callsFake(async () => "")

      signingService = await createSigningService({
        ledgerService: Promise.resolve(ledgerService),
      })

      await signingService.deriveAddress({
        type: "ledger",
        deviceID: "foo",
        path: "bar",
      })

      expect(deriveAddressStub.called).toBe(true)
    })

    it("should use keyring service to derive from a keyring account", async () => {
      const keyringService = await createKeyringService()
      const deriveAddressStub = sandbox
        .stub(keyringService, "deriveAddress")
        .callsFake(async () => "")

      signingService = await createSigningService({
        keyringService: Promise.resolve(keyringService),
      })

      await signingService.deriveAddress({
        type: "keyring",
        keyringID: "foo",
      })

      expect(deriveAddressStub.called).toBe(true)
    })

    it("should error when trying to derive from a read-only account", () => {
      expect(
        signingService.deriveAddress({
          type: "read-only",
        })
      ).rejects.toBeTruthy()
    })
  })
})
