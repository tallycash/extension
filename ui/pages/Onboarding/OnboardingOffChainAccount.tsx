import React, { ReactElement, useState } from "react"
import { Redirect } from "react-router-dom"
import {
  OffChainAccount,
  OffChainAccountCredentials,
  OffChainChallenge,
  OffChainProvider,
} from "@tallyho/tally-background/accounts"
import SharedButton from "../../components/Shared/SharedButton"
import SharedBackButton from "../../components/Shared/SharedBackButton"
import SharedInput from "../../components/Shared/SharedInput"
import OffChainProviderSelect from "../../components/OffChain/OffChainProviderSelect"
import { OffChainService } from "../../services/OffChainService"

export default function OnboardingOffChainAccount(): ReactElement {
  const [redirect, setRedirect] = useState(false)
  const [offChainAccountCredentials, setOffChainAccountCredentials] =
    useState<OffChainAccountCredentials>({ username: "", password: "", challengeResponse: "" })
  const [offChainProvider, setOffChainProvider] = useState<OffChainProvider>()
  const [multiFactorAuthMode, setMultiFactorAuthMode] = useState(false);
  const [challengeMessage, setChallengeMessage] = useState("");

  const disableSubmit =
    !offChainProvider ||
    !offChainAccountCredentials.username ||
    !offChainAccountCredentials.password

  const handleSubmitOffChainCredentials = async () => {
    if (disableSubmit) {
      return
    }

    const account = await OffChainService.login({
      provider: offChainProvider,
      credentials: offChainAccountCredentials,
    });

    if ((account as OffChainChallenge).challengeMessage) {
      (setMultiFactorAuthMode(true))
      setChallengeMessage((account as OffChainChallenge).challengeMessage)
      return
    }
    // TODO use redux thunk to authenticate and save credentials
    // await dispatch(addAddressNetwork(addressOnNetwork))
    // dispatch(setNewSelectedAccount(addressOnNetwork))
    localStorage.setItem("offChainProvider", offChainProvider?.name!)
    localStorage.setItem("token", (account as OffChainAccount).token)
    localStorage.setItem("userId", (account as OffChainAccount).userId)
    setRedirect(true)
  }

  // Redirect to the home tab once an account is set
  if (redirect) {
    return <Redirect to="/" />
  }

  return (
    <section className="standard_width">
      <div className="top">
        <SharedBackButton />
        <div className="wordmark" />
      </div>
      <div className="content">
        <h1 className="serif_header">Explore Tally Ho!</h1>
        <div className="subtitle">
          Add an offchain account such as a centralized exchange or bank.
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmitOffChainCredentials()
          }}
        >
          <div className="input_wrap">
            <OffChainProviderSelect
              onProviderChange={(provider) => setOffChainProvider(provider)}
            />
          </div>
          {multiFactorAuthMode ? 
            <div className="input_wrap">
            <SharedInput
              value={offChainAccountCredentials.challengeResponse}
              label={challengeMessage}
              onChange={(challengeResponse) => {
                setOffChainAccountCredentials((currentCredentials) => ({
                  ...currentCredentials,
                  challengeResponse,
                }))
              }}
              // onFocus={onFocus}
              // errorMessage={errorMessage}
              id="username"
              placeholder="username"
              // isEmpty={isEmpty}
            />
            </div>
          :
          <>

          <div className="input_wrap">
            <SharedInput
              value={offChainAccountCredentials.username}
              label="username"
              onChange={(username) => {
                setOffChainAccountCredentials((currentCredentials) => ({
                  ...currentCredentials,
                  username,
                }))
              }}
              // onFocus={onFocus}
              // errorMessage={errorMessage}
              id="username"
              placeholder="username"
              // isEmpty={isEmpty}
            />
          </div>
          <div className="input_wrap">
            <SharedInput
              value={offChainAccountCredentials.password}
              label="password"
              type="password"
              onChange={(password) => {
                setOffChainAccountCredentials((currentCredentials) => ({
                  ...currentCredentials,
                  password,
                }))
              }}
              // onFocus={onFocus}
              // errorMessage={errorMessage}
              id="username"
              placeholder="username"
              // isEmpty={isEmpty}
            />
          </div>
          </>
          }
          <SharedButton
            type="primary"
            size="large"
            onClick={handleSubmitOffChainCredentials}
            isDisabled={disableSubmit}
            showLoadingOnClick
            isFormSubmit
          >
            Explore Tally Ho!
          </SharedButton>
        </form>
      </div>

      <style jsx>
        {`
          .top {
            display: flex;
            width: 100%;
          }
          .wordmark {
            background: url("./images/wordmark@2x.png");
            background-size: cover;
            width: 95px;
            height: 25px;
            position: absolute;
            left: 0px;
            right: 0px;
            margin: 0 auto;
          }
          section {
            background-color: var(--hunter-green);
          }
          .content {
            display: flex;
            flex-direction: column;
            align-items: center;
            animation: fadeIn ease 200ms;
          }
          .back_button_wrap {
            position: fixed;
            top: 25px;
          }
          h1 {
            margin-top: 55px;
            margin-bottom: 15px;
          }
          section {
            padding-top: 25px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          .subtitle {
            color: var(--green-60);
            width: 307px;
            text-align: center;
            line-height: 24px;
            margin-bottom: 40px;
          }
          .input_wrap {
            width: 320px;
            margin-bottom: 24px;
          }
        `}
      </style>
    </section>
  )
}
