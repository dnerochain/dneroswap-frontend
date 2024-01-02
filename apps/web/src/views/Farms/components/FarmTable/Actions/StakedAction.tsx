import { useTranslation } from '@dneroswap/localization'
import { useModal, useToast } from '@dneroswap/uikit'
import { FarmWidget } from '@dneroswap/widgets-internal'
import ConnectWalletButton from 'components/ConnectWalletButton'
import { ToastDescriptionWithTx } from 'components/Toast'
import { BASE_ADD_LIQUIDITY_URL, DEFAULT_TOKEN_DECIMAL } from 'config'
import useCatchTxError from 'hooks/useCatchTxError'
import { useERC20 } from 'hooks/useContract'
import { useRouter } from 'next/router'
import { useCallback, useContext, useState, useMemo } from 'react'
import { useAppDispatch } from 'state'
import { fetchFarmUserDataAsync } from 'state/farms'
import { useTransactionAdder, useNonDneroFarmPendingTransaction } from 'state/transactions/hooks'
import { FarmTransactionStatus, NonDneroFarmStepType } from 'state/transactions/actions'
import { pickFarmTransactionTx } from 'state/global/actions'
import { useFarmFromPid } from 'state/farms/hooks'
import { useWDneroPrice } from 'hooks/useWDneroPrice'
import BWDneroCalculator from 'views/Farms/components/YieldBooster/components/BWDneroCalculator'
import getLiquidityUrlPathParts from 'utils/getLiquidityUrlPathParts'
import BigNumber from 'bignumber.js'
import useNativeCurrency from 'hooks/useNativeCurrency'
import { formatLpBalance } from '@dneroswap/utils/formatBalance'
import { WNATIVE, NATIVE } from '@dneroswap/sdk'
import { ChainId } from '@dneroswap/chains'
import WalletModal, { WalletView } from 'components/Menu/UserMenu/WalletModal'
import { useAccount } from 'wagmi'
import { useIsBloctoETH } from 'views/Farms'
import { Hash } from 'viem'
import { FarmWithStakedValue } from '@dneroswap/farms'
import useAccountActiveChain from 'hooks/useAccountActiveChain'
import useApproveFarm from '../../../hooks/useApproveFarm'
import useStakeFarms from '../../../hooks/useStakeFarms'
import useUnstakeFarms from '../../../hooks/useUnstakeFarms'
import { YieldBoosterStateContext } from '../../YieldBooster/components/ProxyFarmContainer'
import useProxyStakedActions from '../../YieldBooster/hooks/useProxyStakedActions'
import { YieldBoosterState } from '../../YieldBooster/hooks/useYieldBoosterState'
import { useFirstTimeCrossFarming } from '../../../hooks/useFirstTimeCrossFarming'

interface StackedActionProps extends FarmWithStakedValue {
  userDataReady: boolean
  lpLabel?: string
  displayApr?: string
  onStake?: (value: string) => Promise<Hash>
  onUnstake?: (value: string) => Promise<Hash>
  onDone?: () => void
  onApprove?: () => Promise<Hash>
  isApproved?: boolean
  shouldUseProxyFarm?: boolean
}

export function useStakedActions(lpContract, pid, vaultPid) {
  const { account, chainId } = useAccountActiveChain()
  const { onStake } = useStakeFarms(pid, vaultPid)
  const { onUnstake } = useUnstakeFarms(pid, vaultPid)
  const dispatch = useAppDispatch()

  const { onApprove } = useApproveFarm(lpContract, chainId)

  const onDone = useCallback(
    () => dispatch(fetchFarmUserDataAsync({ account, pids: [pid], chainId })),
    [account, pid, chainId, dispatch],
  )

  return {
    onStake,
    onUnstake,
    onApprove,
    onDone,
  }
}

export const ProxyStakedContainer = ({ children, ...props }) => {
  const { address: account } = useAccount()

  const { lpAddress } = props
  const lpContract = useERC20(lpAddress)

  const { onStake, onUnstake, onApprove, onDone } = useProxyStakedActions(props.pid, lpContract)

  const { allowance } = props.userData || {}

  const isApproved = account && allowance && allowance.isGreaterThan(0)

  return children({
    ...props,
    onStake,
    onDone,
    onUnstake,
    onApprove,
    isApproved,
  })
}

export const StakedContainer = ({ children, ...props }) => {
  const { address: account } = useAccount()

  const { lpAddress } = props
  const lpContract = useERC20(lpAddress)
  const { onStake, onUnstake, onApprove, onDone } = useStakedActions(lpContract, props.pid, props.vaultPid)

  const { allowance } = props.userData || {}

  const isApproved = account && allowance && allowance.isGreaterThan(0)

  return children({
    ...props,
    onStake,
    onDone,
    onUnstake,
    onApprove,
    isApproved,
  })
}

const Staked: React.FunctionComponent<React.PropsWithChildren<StackedActionProps>> = ({
  pid,
  apr,
  vaultPid,
  multiplier,
  lpSymbol,
  lpLabel,
  lpAddress,
  lpTokenPrice,
  quoteToken,
  token,
  userDataReady,
  displayApr,
  lpTotalSupply,
  tokenAmountTotal,
  quoteTokenAmountTotal,
  userData,
  onDone,
  onStake,
  onUnstake,
  onApprove,
  isApproved,
}) => {
  const dispatch = useAppDispatch()
  const native = useNativeCurrency()
  const pendingFarm = useNonDneroFarmPendingTransaction(lpAddress)
  const { boosterState } = useContext(YieldBoosterStateContext)
  const { isFirstTime, refresh: refreshFirstTime } = useFirstTimeCrossFarming(vaultPid)
  const { lpTokenStakedAmount } = useFarmFromPid(pid)
  const { t } = useTranslation()
  const { toastSuccess } = useToast()
  const addTransaction = useTransactionAdder()
  const isBloctoETH = useIsBloctoETH()
  const { fetchWithCatchTxError, fetchTxResponse, loading: pendingTx } = useCatchTxError()
  const { account, chainId } = useAccountActiveChain()

  const { tokenBalance, stakedBalance, allowance } = userData || {}

  const router = useRouter()
  const wdneroPrice = useWDneroPrice()
  const [bWDneroMultiplier, setBWDneroMultiplier] = useState<number | null>(() => null)

  const liquidityUrlPathParts = getLiquidityUrlPathParts({
    quoteTokenAddress: quoteToken.address,
    tokenAddress: token.address,
    chainId,
  })
  const addLiquidityUrl = `${BASE_ADD_LIQUIDITY_URL}/${liquidityUrlPathParts}`

  const isStakeReady = useMemo(() => {
    return ['history', 'archived'].some((item) => router.pathname.includes(item)) || pendingFarm.length > 0
  }, [pendingFarm, router])

  const crossChainWarningText = useMemo(() => {
    return isFirstTime
      ? t('A small amount of %nativeToken% is required for the first-time setup of cross-chain WDNERO farming.', {
          nativeToken: native.symbol,
        })
      : t('For safety, cross-chain transactions will take around 30 minutes to confirm.')
  }, [isFirstTime, native, t])

  const handleStake = async (amount: string) => {
    if (vaultPid) {
      await handleNonDneroStake(amount)
      refreshFirstTime()
    } else {
      const receipt = await fetchWithCatchTxError(() => onStake(amount))

      if (receipt?.status) {
        toastSuccess(
          `${t('Staked')}!`,
          <ToastDescriptionWithTx txHash={receipt.transactionHash}>
            {t('Your funds have been staked in the farm')}
          </ToastDescriptionWithTx>,
        )
        onDone()
      }
    }
  }

  const handleNonDneroStake = async (amountValue: string) => {
    const receipt = await fetchTxResponse(() => onStake(amountValue))
    const amountAsBigNumber = new BigNumber(amountValue).times(DEFAULT_TOKEN_DECIMAL)
    const amount = formatLpBalance(new BigNumber(amountAsBigNumber), 18)

    if (receipt) {
      addTransaction(receipt, {
        type: 'non-dnero-farm',
        translatableSummary: {
          text: 'Stake %amount% %lpSymbol% Token',
          data: { amount, lpSymbol },
        },
        nonDneroFarm: {
          type: NonDneroFarmStepType.STAKE,
          status: FarmTransactionStatus.PENDING,
          amount,
          lpSymbol,
          lpAddress,
          steps: [
            {
              step: 1,
              chainId,
              tx: receipt.hash,
              isFirstTime,
              status: FarmTransactionStatus.PENDING,
            },
            {
              step: 2,
              tx: '',
              chainId: ChainId.DNERO,
              status: FarmTransactionStatus.PENDING,
            },
          ],
        },
      })

      dispatch(pickFarmTransactionTx({ tx: receipt.hash, chainId }))
      onDone()
    }
  }

  const handleUnstake = async (amount: string) => {
    if (vaultPid) {
      await handleNonDneroUnStake(amount)
    } else {
      const receipt = await fetchWithCatchTxError(() => onUnstake(amount))
      if (receipt?.status) {
        toastSuccess(
          `${t('Unstaked')}!`,
          <ToastDescriptionWithTx txHash={receipt.transactionHash}>
            {t('Your earnings have also been harvested to your wallet')}
          </ToastDescriptionWithTx>,
        )
        onDone()
      }
    }
  }

  const handleNonDneroUnStake = async (amountValue: string) => {
    const receipt = await fetchTxResponse(() => onUnstake(amountValue))
    const amountAsBigNumber = new BigNumber(amountValue).times(DEFAULT_TOKEN_DECIMAL)
    const amount = formatLpBalance(new BigNumber(amountAsBigNumber), 18)

    if (receipt) {
      addTransaction(receipt, {
        type: 'non-dnero-farm',
        translatableSummary: {
          text: 'Unstake %amount% %lpSymbol% Token',
          data: { amount, lpSymbol },
        },
        nonDneroFarm: {
          type: NonDneroFarmStepType.UNSTAKE,
          status: FarmTransactionStatus.PENDING,
          amount,
          lpSymbol,
          lpAddress,
          steps: [
            {
              step: 1,
              chainId,
              tx: receipt.hash,
              status: FarmTransactionStatus.PENDING,
            },
            {
              step: 2,
              chainId: ChainId.DNERO,
              tx: '',
              status: FarmTransactionStatus.PENDING,
            },
            {
              step: 3,
              chainId,
              tx: '',
              status: FarmTransactionStatus.PENDING,
            },
          ],
        },
      })

      dispatch(pickFarmTransactionTx({ tx: receipt.hash, chainId }))
      onDone()
    }
  }

  const bWDneroCalculatorSlot = (calculatorBalance) => (
    <BWDneroCalculator
      targetInputBalance={calculatorBalance}
      earningTokenPrice={wdneroPrice.toNumber()}
      lpTokenStakedAmount={lpTokenStakedAmount}
      setBWDneroMultiplier={setBWDneroMultiplier}
    />
  )

  const handleApprove = useCallback(async () => {
    const receipt = await fetchWithCatchTxError(() => onApprove())
    if (receipt?.status) {
      toastSuccess(t('Contract Enabled'), <ToastDescriptionWithTx txHash={receipt.transactionHash} />)
      onDone()
    }
  }, [onApprove, t, toastSuccess, fetchWithCatchTxError, onDone])

  const [onPresentDeposit] = useModal(
    <FarmWidget.DepositModal
      account={account}
      pid={pid}
      lpTotalSupply={lpTotalSupply}
      max={tokenBalance}
      lpPrice={lpTokenPrice}
      lpLabel={lpLabel}
      apr={apr}
      displayApr={displayApr}
      stakedBalance={stakedBalance}
      tokenName={lpSymbol}
      multiplier={multiplier}
      addLiquidityUrl={addLiquidityUrl}
      wdneroPrice={wdneroPrice}
      showActiveBooster={boosterState === YieldBoosterState.ACTIVE}
      bWDneroMultiplier={bWDneroMultiplier}
      showCrossChainFarmWarning={chainId !== ChainId.DNERO && chainId !== ChainId.DNERO_TESTNET}
      crossChainWarningText={crossChainWarningText}
      decimals={18}
      allowance={allowance}
      enablePendingTx={pendingTx}
      onConfirm={handleStake}
      handleApprove={handleApprove}
      bWDneroCalculatorSlot={bWDneroCalculatorSlot}
    />,
    true,
    true,
    `farm-deposit-modal-${pid}`,
  )

  const [onPresentWithdraw] = useModal(
    <FarmWidget.WithdrawModal
      showActiveBooster={boosterState === YieldBoosterState.ACTIVE}
      max={stakedBalance}
      onConfirm={handleUnstake}
      lpPrice={lpTokenPrice}
      tokenName={lpSymbol}
      decimals={18}
      showCrossChainFarmWarning={chainId !== ChainId.DNERO && chainId !== ChainId.DNERO_TESTNET}
    />,
  )

  const [onPresentTransactionModal] = useModal(<WalletModal initialView={WalletView.TRANSACTIONS} />)

  const onClickLoadingIcon = () => {
    const { length } = pendingFarm
    if (length) {
      if (length > 1) {
        onPresentTransactionModal()
      } else {
        dispatch(pickFarmTransactionTx({ tx: pendingFarm[0].txid, chainId }))
      }
    }
  }

  if (!account) {
    return (
      <FarmWidget.FarmTable.AccountNotConnect>
        <ConnectWalletButton width="100%" />
      </FarmWidget.FarmTable.AccountNotConnect>
    )
  }

  if (!isApproved && stakedBalance?.eq(0)) {
    return <FarmWidget.FarmTable.EnableStakeAction pendingTx={pendingTx || isBloctoETH} handleApprove={handleApprove} />
  }

  if (!userDataReady) {
    return <FarmWidget.FarmTable.StakeActionDataNotReady />
  }

  if (stakedBalance?.gt(0)) {
    return (
      <FarmWidget.FarmTable.StakedActionComponent
        lpSymbol={lpSymbol}
        disabledMinusButton={pendingFarm.length > 0}
        disabledPlusButton={isStakeReady || isBloctoETH}
        onPresentWithdraw={onPresentWithdraw}
        onPresentDeposit={onPresentDeposit}
      >
        <FarmWidget.StakedLP
          decimals={18}
          stakedBalance={stakedBalance}
          quoteTokenSymbol={
            WNATIVE[chainId]?.symbol === quoteToken.symbol ? NATIVE[chainId]?.symbol : quoteToken.symbol
          }
          tokenSymbol={WNATIVE[chainId]?.symbol === token.symbol ? NATIVE[chainId]?.symbol : token.symbol}
          lpTotalSupply={lpTotalSupply}
          lpTokenPrice={lpTokenPrice}
          tokenAmountTotal={tokenAmountTotal}
          quoteTokenAmountTotal={quoteTokenAmountTotal}
          pendingFarmLength={pendingFarm.length}
          onClickLoadingIcon={onClickLoadingIcon}
        />
      </FarmWidget.FarmTable.StakedActionComponent>
    )
  }

  return (
    <FarmWidget.FarmTable.StakeComponent
      lpSymbol={lpSymbol}
      isStakeReady={isStakeReady}
      onPresentDeposit={onPresentDeposit}
    />
  )
}

export default Staked
